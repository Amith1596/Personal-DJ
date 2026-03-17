"""Transition Engine — executes the chosen mix strategy.

Takes a MixPlan from the mix planner and renders it to an audio file.
Dispatches to one of five transition strategies based on Camelot distance:
- STEM_SWAP (0-1): Gradual 8-bar stem-by-stem swap
- RHYTHM_BRIDGE (2-3): Drums+bass only in overlap zone
- PITCH_SHIFT (4-5): Pitch-shift to match key, then crossfade
- HARD_CUT (6+): Clean cut on downbeat with 50ms fades
- BEAT_LOOP (fallback): Loop last N bars of A while fading in B
"""

import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

try:
    import pyrubberband
except ImportError:  # pragma: no cover
    pyrubberband = None  # type: ignore[assignment]

try:
    import librosa
except ImportError:  # pragma: no cover
    librosa = None  # type: ignore[assignment]

from ..models.schemas import ManualSegment, MixPlan, TransitionStrategy


# --- Helpers ---


def _bars_to_samples(bars: int, bpm: float, sr: int) -> int:
    """Convert bar count to sample count. 1 bar = 4 beats."""
    return int(bars * 4 * 60 / bpm * sr)


def _mix_to_mono_or_stereo(audio: np.ndarray) -> np.ndarray:
    """Ensure audio is 1D (mono) for processing."""
    if audio.ndim == 2:
        return np.mean(audio, axis=1)
    return audio


def _load_audio_segment(
    file_path: str, start: float, end: float, sr: int = 44100
) -> np.ndarray:
    """Load a segment of audio from file_path between start and end seconds."""
    duration = end - start
    if duration <= 0:
        return np.array([], dtype=np.float32)
    y, _ = librosa.load(file_path, sr=sr, offset=start, duration=duration, mono=True)
    return y


def _compute_rms(audio: np.ndarray) -> float:
    """Compute RMS loudness of an audio signal."""
    if len(audio) == 0:
        return 0.0
    return float(np.sqrt(np.mean(audio**2)))


def _loudness_match(audio: np.ndarray, target_rms: float) -> np.ndarray:
    """Adjust gain so audio's RMS matches target_rms.

    Prevents silence (no-op if source is silent) and clips gain at 6 dB
    (factor of 2) to avoid amplifying noise in quiet tracks.
    """
    if len(audio) == 0:
        return audio
    source_rms = _compute_rms(audio)
    if source_rms < 1e-6:
        return audio  # effectively silent, don't amplify noise
    gain = target_rms / source_rms
    gain = min(gain, 2.0)  # cap at +6 dB to avoid blowing up quiet tracks
    return audio * gain


def _loudness_match_pair(
    audio_a: np.ndarray, audio_b: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Match loudness of two audio segments to their average RMS."""
    rms_a = _compute_rms(audio_a)
    rms_b = _compute_rms(audio_b)
    if rms_a < 1e-6 and rms_b < 1e-6:
        return audio_a, audio_b
    target = (rms_a + rms_b) / 2.0
    return _loudness_match(audio_a, target), _loudness_match(audio_b, target)


def _loudness_match_many(audios: list[np.ndarray]) -> list[np.ndarray]:
    """Match loudness of N audio segments to their average RMS."""
    rms_values = [_compute_rms(a) for a in audios]
    valid = [r for r in rms_values if r > 1e-6]
    if not valid:
        return audios
    target = sum(valid) / len(valid)
    return [_loudness_match(a, target) for a in audios]


def _splice_crossfade(a: np.ndarray, b: np.ndarray, fade_samples: int) -> np.ndarray:
    """Join two audio arrays with a short overlap-add crossfade to avoid clicks."""
    if len(a) < fade_samples or len(b) < fade_samples or fade_samples <= 0:
        return np.concatenate([a, b])
    fade_out = np.linspace(1.0, 0.0, fade_samples)
    fade_in = np.linspace(0.0, 1.0, fade_samples)
    overlap = a[-fade_samples:] * fade_out + b[:fade_samples] * fade_in
    return np.concatenate([a[:-fade_samples], overlap, b[fade_samples:]])


# --- Stem Separation ---


def _separate_stems(file_path: str) -> dict[str, np.ndarray]:
    """Run Demucs htdemucs_ft on the file. Returns dict with keys:
    'vocals', 'drums', 'bass', 'other'. Values are numpy arrays."""
    with tempfile.TemporaryDirectory() as tmpdir:
        cmd = [
            "python",
            "-m",
            "demucs",
            "-n",
            "htdemucs_ft",
            "-o",
            tmpdir,
            file_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        # Demucs outputs to tmpdir/htdemucs_ft/<track_name>/
        track_name = Path(file_path).stem
        stem_dir = Path(tmpdir) / "htdemucs_ft" / track_name

        stems = {}
        for stem_name in ["vocals", "drums", "bass", "other"]:
            stem_path = stem_dir / f"{stem_name}.wav"
            audio, _ = sf.read(str(stem_path))
            stems[stem_name] = _mix_to_mono_or_stereo(audio)

        return stems


# --- Transition Strategies ---


def _stem_swap(
    stems_a: dict[str, np.ndarray],
    stems_b: dict[str, np.ndarray],
    sr: int,
    transition_bars: int,
    bpm: float,
) -> np.ndarray:
    """Camelot dist 0-1. Gradual 8-bar stem-by-stem swap.
    Bar 1-2: swap drums. Bar 3-4: swap bass. Bar 5-6: swap other. Bar 7-8: swap vocals.
    Uses linear crossfade within each 2-bar window."""
    total_samples = _bars_to_samples(transition_bars, bpm, sr)
    # Each stem gets transition_bars/4 bars (typically 2 bars each for 8-bar transition)
    bars_per_stem = max(1, transition_bars // 4)
    samples_per_group = _bars_to_samples(bars_per_stem, bpm, sr)

    stem_order = ["drums", "bass", "other", "vocals"]
    output = np.zeros(total_samples)

    for i, stem_name in enumerate(stem_order):
        a_stem = stems_a[stem_name][:total_samples]
        b_stem = stems_b[stem_name][:total_samples]

        # Pad if needed
        if len(a_stem) < total_samples:
            a_stem = np.pad(a_stem, (0, total_samples - len(a_stem)))
        if len(b_stem) < total_samples:
            b_stem = np.pad(b_stem, (0, total_samples - len(b_stem)))

        # Build per-stem crossfade envelope
        envelope = np.zeros(total_samples)
        group_start = i * samples_per_group
        group_end = min(group_start + samples_per_group, total_samples)

        # Before this stem's window: use A
        # During window: linear crossfade from A to B
        # After window: use B
        fade_len = group_end - group_start
        if fade_len > 0:
            fade = np.linspace(0.0, 1.0, fade_len)
        else:
            fade = np.array([])

        # envelope = 0 means A, envelope = 1 means B
        envelope[:group_start] = 0.0
        envelope[group_start:group_end] = fade
        envelope[group_end:] = 1.0

        stem_mix = a_stem * (1.0 - envelope) + b_stem * envelope
        output += stem_mix

    return output


def _rhythm_bridge(
    stems_a: dict[str, np.ndarray],
    stems_b: dict[str, np.ndarray],
    sr: int,
    transition_bars: int,
    bpm: float,
) -> np.ndarray:
    """Camelot dist 2-3. Only drums+bass in overlap zone.
    Fade out A's melodic (vocals+other), crossfade A's drums+bass to B's,
    then fade in B's melodic."""
    total_samples = _bars_to_samples(transition_bars, bpm, sr)
    third = total_samples // 3

    def _pad(arr: np.ndarray, length: int) -> np.ndarray:
        if len(arr) < length:
            return np.pad(arr, (0, length - len(arr)))
        return arr[:length]

    # Get stems, padded/trimmed to total_samples
    a_vocals = _pad(stems_a["vocals"], total_samples)
    a_other = _pad(stems_a["other"], total_samples)
    a_drums = _pad(stems_a["drums"], total_samples)
    a_bass = _pad(stems_a["bass"], total_samples)
    b_vocals = _pad(stems_b["vocals"], total_samples)
    b_other = _pad(stems_b["other"], total_samples)
    b_drums = _pad(stems_b["drums"], total_samples)
    b_bass = _pad(stems_b["bass"], total_samples)

    output = np.zeros(total_samples)

    # First third: fade out A's melodic content (vocals + other)
    fade_out = np.ones(total_samples)
    fade_out[:third] = np.linspace(1.0, 0.0, third)
    fade_out[third:] = 0.0
    output += a_vocals * fade_out
    output += a_other * fade_out

    # A's drums+bass present for first two thirds, crossfading to B in middle third
    drums_bass_env = np.zeros(total_samples)
    # First third: A's drums+bass at full
    drums_bass_env[:third] = 0.0  # 0 = A
    # Middle third: crossfade A to B
    drums_bass_env[third : 2 * third] = np.linspace(
        0.0, 1.0, 2 * third - third
    )
    # Last third: B's drums+bass at full
    drums_bass_env[2 * third :] = 1.0

    output += a_drums * (1.0 - drums_bass_env) + b_drums * drums_bass_env
    output += a_bass * (1.0 - drums_bass_env) + b_bass * drums_bass_env

    # Last third: fade in B's melodic content
    fade_in = np.zeros(total_samples)
    fade_in[: 2 * third] = 0.0
    remaining = total_samples - 2 * third
    fade_in[2 * third :] = np.linspace(0.0, 1.0, remaining)
    output += b_vocals * fade_in
    output += b_other * fade_in

    return output


def _pitch_shift(
    audio_a: np.ndarray,
    audio_b: np.ndarray,
    sr: int,
    semitones: float,
    transition_bars: int,
    bpm: float,
) -> np.ndarray:
    """Camelot dist 4-5. Pitch-shift the smaller-delta track to match.
    Uses pyrubberband for pitch shifting. Crossfade after shift."""
    total_samples = _bars_to_samples(transition_bars, bpm, sr)

    a = audio_a[:total_samples]
    b = audio_b[:total_samples]

    if len(a) < total_samples:
        a = np.pad(a, (0, total_samples - len(a)))
    if len(b) < total_samples:
        b = np.pad(b, (0, total_samples - len(b)))

    # Pitch-shift track B to match track A's key
    b_shifted = pyrubberband.pitch_shift(b, sr, n_steps=semitones)

    # Ensure same length after pitch shift
    if len(b_shifted) < total_samples:
        b_shifted = np.pad(b_shifted, (0, total_samples - len(b_shifted)))
    else:
        b_shifted = b_shifted[:total_samples]

    # Linear crossfade
    fade = np.linspace(0.0, 1.0, total_samples)
    return a * (1.0 - fade) + b_shifted * fade


def _hard_cut(
    audio_a: np.ndarray,
    audio_b: np.ndarray,
    sr: int,
    bpm: float,
) -> np.ndarray:
    """Camelot dist 6+. Clean cut on nearest downbeat.
    Short 50ms fade-out on A, 50ms fade-in on B to avoid clicks."""
    fade_samples = int(0.05 * sr)

    a = audio_a.copy()
    b = audio_b.copy()

    # Apply 50ms fade-out to end of A
    if len(a) >= fade_samples:
        fade_out = np.linspace(1.0, 0.0, fade_samples)
        a[-fade_samples:] *= fade_out

    # Apply 50ms fade-in to start of B
    if len(b) >= fade_samples:
        fade_in = np.linspace(0.0, 1.0, fade_samples)
        b[:fade_samples] *= fade_in

    return np.concatenate([a, b])


def _beat_loop(
    audio_a: np.ndarray,
    audio_b: np.ndarray,
    sr: int,
    bpm: float,
    loop_bars: int = 2,
) -> np.ndarray:
    """Universal fallback. Loop last N bars of A while fading in B.
    Creates a smooth bed for the transition."""
    loop_samples = _bars_to_samples(loop_bars, bpm, sr)

    # Extract the last loop_bars bars of audio_a
    if len(audio_a) >= loop_samples:
        loop_segment = audio_a[-loop_samples:]
    else:
        loop_segment = audio_a.copy()
        loop_samples = len(loop_segment)

    # The transition zone is the length of audio_b (or a reasonable duration)
    transition_len = len(audio_b)

    # Repeat the loop to cover the transition
    if loop_samples > 0:
        repeats = int(np.ceil(transition_len / loop_samples))
        looped = np.tile(loop_segment, repeats)[:transition_len]
    else:
        looped = np.zeros(transition_len)

    # Pad audio_b if needed
    b = audio_b[:transition_len]
    if len(b) < transition_len:
        b = np.pad(b, (0, transition_len - len(b)))

    # Crossfade: loop fades out, B fades in
    fade = np.linspace(0.0, 1.0, transition_len)
    return looped * (1.0 - fade) + b * fade


# --- Core Transition Renderer (no file I/O) ---


def render_transition_audio(
    mix_plan: MixPlan, sr: int = 44100, use_stems: bool = True
) -> np.ndarray:
    """Render just the transition blend between two tracks. Returns numpy array.

    This is the pure computation core. No file loading, no file writing.
    Callers provide loaded audio via the mix_plan's file paths (for stem separation)
    or pre-loaded audio segments.

    Args:
        mix_plan: The transition plan.
        sr: Sample rate.
        use_stems: If True, use Demucs for stem-based strategies. If False,
                   fall back to simple crossfade (faster for previews).
    """
    exit_time = mix_plan.cue_pair.exit_cue.time
    entry_time = mix_plan.cue_pair.entry_cue.time
    transition_bars = mix_plan.transition_duration_bars
    bpm = mix_plan.track_a.bpm
    transition_samples = _bars_to_samples(transition_bars, bpm, sr)
    transition_duration_sec = transition_samples / sr

    # Load transition regions
    audio_a_trans = _load_audio_segment(
        mix_plan.track_a.file_path,
        exit_time,
        exit_time + transition_duration_sec,
        sr,
    )
    audio_b_trans = _load_audio_segment(
        mix_plan.track_b.file_path,
        entry_time,
        min(entry_time + transition_duration_sec, mix_plan.track_b.duration),
        sr,
    )

    # Loudness-match the two transition regions before blending
    audio_a_trans, audio_b_trans = _loudness_match_pair(audio_a_trans, audio_b_trans)

    strategy = mix_plan.strategy

    # For preview mode (use_stems=False), downgrade stem-based strategies to crossfade
    if not use_stems and strategy in (
        TransitionStrategy.STEM_SWAP,
        TransitionStrategy.RHYTHM_BRIDGE,
    ):
        total = _bars_to_samples(transition_bars, bpm, sr)
        a = audio_a_trans[:total]
        b = audio_b_trans[:total]
        if len(a) < total:
            a = np.pad(a, (0, total - len(a)))
        if len(b) < total:
            b = np.pad(b, (0, total - len(b)))
        fade = np.linspace(0.0, 1.0, total)
        return a * (1.0 - fade) + b * fade

    if strategy == TransitionStrategy.STEM_SWAP:
        stems_a = _separate_stems(mix_plan.track_a.file_path)
        stems_b = _separate_stems(mix_plan.track_b.file_path)
        start_sample_a = int(exit_time * sr)
        start_sample_b = int(entry_time * sr)
        trimmed_a = {
            k: v[start_sample_a : start_sample_a + transition_samples]
            for k, v in stems_a.items()
        }
        trimmed_b = {
            k: v[start_sample_b : start_sample_b + transition_samples]
            for k, v in stems_b.items()
        }
        return _stem_swap(trimmed_a, trimmed_b, sr, transition_bars, bpm)

    if strategy == TransitionStrategy.RHYTHM_BRIDGE:
        stems_a = _separate_stems(mix_plan.track_a.file_path)
        stems_b = _separate_stems(mix_plan.track_b.file_path)
        start_sample_a = int(exit_time * sr)
        start_sample_b = int(entry_time * sr)
        trimmed_a = {
            k: v[start_sample_a : start_sample_a + transition_samples]
            for k, v in stems_a.items()
        }
        trimmed_b = {
            k: v[start_sample_b : start_sample_b + transition_samples]
            for k, v in stems_b.items()
        }
        return _rhythm_bridge(trimmed_a, trimmed_b, sr, transition_bars, bpm)

    if strategy == TransitionStrategy.PITCH_SHIFT:
        semitones = mix_plan.cue_pair.camelot_distance
        return _pitch_shift(
            audio_a_trans, audio_b_trans, sr, semitones, transition_bars, bpm
        )

    if strategy == TransitionStrategy.HARD_CUT:
        return _hard_cut(audio_a_trans, audio_b_trans, sr, bpm)

    if strategy == TransitionStrategy.BEAT_LOOP:
        return _beat_loop(audio_a_trans, audio_b_trans, sr, bpm)

    # Fallback
    return _beat_loop(audio_a_trans, audio_b_trans, sr, bpm)


# --- Top-Level Entry Point (Auto Mode) ---


def render_transition(mix_plan: MixPlan, output_path: str) -> str:
    """Top-level entry point for auto mode. Renders the full transition to a file.
    Returns the output file path."""
    sr = 44100

    exit_time = mix_plan.cue_pair.exit_cue.time
    entry_time = mix_plan.cue_pair.entry_cue.time
    transition_bars = mix_plan.transition_duration_bars
    bpm = mix_plan.track_a.bpm
    transition_samples = _bars_to_samples(transition_bars, bpm, sr)
    transition_duration_sec = transition_samples / sr

    # Pre-transition A: Song A's selected section up to exit cue
    sec_a = mix_plan.selected_section_a
    section_a_duration = sec_a.end - sec_a.start
    max_pre_sec = max(section_a_duration, 30.0)
    section_a_start = sec_a.start
    if exit_time - section_a_start > max_pre_sec:
        section_a_start = exit_time - max_pre_sec
    audio_a_pre = _load_audio_segment(
        mix_plan.track_a.file_path, section_a_start, exit_time, sr
    )

    # Core transition (already loudness-matched internally)
    transition_audio = render_transition_audio(mix_plan, sr)

    # Post-transition B: from where transition ends through B's best section
    b_post_start = entry_time + transition_duration_sec
    sec_b = mix_plan.selected_section_b
    b_post_end = sec_b.end
    if b_post_end <= b_post_start:
        a_pre_duration = exit_time - section_a_start
        b_post_end = min(b_post_start + a_pre_duration, mix_plan.track_b.duration)
    b_post_end = min(b_post_end, mix_plan.track_b.duration)
    if b_post_start < b_post_end:
        audio_b_post = _load_audio_segment(
            mix_plan.track_b.file_path, b_post_start, b_post_end, sr
        )
    else:
        audio_b_post = np.array([], dtype=np.float32)

    # Loudness-match pre/post segments to the transition level
    trans_rms = _compute_rms(transition_audio)
    if trans_rms > 1e-6:
        audio_a_pre = _loudness_match(audio_a_pre, trans_rms)
        if len(audio_b_post) > 0:
            audio_b_post = _loudness_match(audio_b_post, trans_rms)

    # Build final audio with crossfades at splice points
    splice_samples = int(0.01 * sr)  # 10ms overlap-add crossfade
    final_audio = _splice_crossfade(audio_a_pre, transition_audio, splice_samples)
    if len(audio_b_post) > 0:
        final_audio = _splice_crossfade(final_audio, audio_b_post, splice_samples)

    # Gentle fade out at end: 2 bars
    fade_out_bpm = mix_plan.track_b.bpm or bpm
    fade_out_samples = min(_bars_to_samples(2, fade_out_bpm, sr), len(final_audio))
    if fade_out_samples > 0:
        final_audio[-fade_out_samples:] *= np.linspace(1.0, 0.0, fade_out_samples)

    # Normalize
    peak = np.max(np.abs(final_audio))
    if peak > 0:
        final_audio = final_audio / peak

    sf.write(output_path, final_audio, sr)
    return output_path


# --- Chain Renderer (Manual Mode) ---


def render_chain(
    analyses: list,
    user_segments: list[ManualSegment],
    output_path: str,
    use_stems: bool = True,
) -> str:
    """Render a chain of N songs with N-1 transitions.

    Assembly: [song1_segment] + [trans_12] + [song2_trimmed] + [trans_23] + ... + [songN_trimmed]
    Each song after the first is trimmed at its start by the transition overlap.

    Args:
        analyses: List of TrackAnalysis objects (one per song).
        user_segments: List of ManualSegment objects with user timestamps.
        output_path: Where to write the final WAV.
        use_stems: Whether to use Demucs for stem-based strategies.

    Returns:
        The output file path.
    """
    from .mix_planner import create_mix_plan_manual

    sr = 44100
    splice_samples = int(0.01 * sr)  # 10ms crossfade at splice points
    n = len(analyses)

    # Load all song segments
    song_audios = []
    for i, (analysis, seg) in enumerate(zip(analyses, user_segments)):
        audio = _load_audio_segment(seg.file_path, seg.start_time, seg.end_time, sr)
        song_audios.append(audio)

    # Loudness-match all songs before mixing
    song_audios = _loudness_match_many(song_audios)

    # Build transitions between adjacent pairs
    transitions = []
    for i in range(n - 1):
        plan = create_mix_plan_manual(
            analyses[i], analyses[i + 1], user_segments[i], user_segments[i + 1]
        )
        trans_audio = render_transition_audio(plan, sr, use_stems=use_stems)
        transitions.append(trans_audio)

    # Assemble: song1 + trans_12 + song2_trimmed + trans_23 + ...
    # The transition overlaps with the end of song[i] and start of song[i+1].
    # We trim the transition overlap from each song to avoid double-playing.
    final = song_audios[0].copy()

    for i in range(len(transitions)):
        trans = transitions[i]
        trans_len = len(trans)

        # Trim end of current assembled audio by half the transition length
        # (the transition already contains audio from song[i]'s exit region)
        trim_end = min(trans_len // 2, len(final))
        if trim_end > 0:
            final = final[:-trim_end]

        # Splice transition with crossfade
        final = _splice_crossfade(final, trans, splice_samples)

        # Add next song, trimmed at start by half the transition length
        next_audio = song_audios[i + 1]
        trim_start = min(trans_len // 2, len(next_audio))
        if trim_start < len(next_audio):
            trimmed_next = next_audio[trim_start:]
            final = _splice_crossfade(final, trimmed_next, splice_samples)

    # 2-bar fade out at end
    last_bpm = analyses[-1].bpm
    fade_out_samples = min(_bars_to_samples(2, last_bpm, sr), len(final))
    if fade_out_samples > 0:
        final[-fade_out_samples:] *= np.linspace(1.0, 0.0, fade_out_samples)

    # Normalize
    peak = np.max(np.abs(final))
    if peak > 0:
        final = final / peak

    sf.write(output_path, final, sr)
    return output_path
