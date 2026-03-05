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

from ..models.schemas import MixPlan, TransitionStrategy


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
    y, _ = librosa.load(file_path, sr=sr, offset=start, duration=duration, mono=True)
    return y


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


# --- Top-Level Entry Point ---


def render_transition(mix_plan: MixPlan, output_path: str) -> str:
    """Top-level entry point. Renders the transition to an audio file.
    Returns the output file path."""
    sr = 44100

    exit_time = mix_plan.cue_pair.exit_cue.time
    entry_time = mix_plan.cue_pair.entry_cue.time
    transition_bars = mix_plan.transition_duration_bars
    bpm = mix_plan.track_a.bpm
    transition_samples = _bars_to_samples(transition_bars, bpm, sr)
    transition_duration_sec = transition_samples / sr

    # Load section A: from section start to exit point
    section_a_start = mix_plan.selected_section_a.start
    section_a_end = exit_time
    audio_a_pre = _load_audio_segment(
        mix_plan.track_a.file_path, section_a_start, section_a_end, sr
    )

    # Load transition region of A: exit_time to exit_time + transition_duration
    audio_a_trans = _load_audio_segment(
        mix_plan.track_a.file_path,
        exit_time,
        exit_time + transition_duration_sec,
        sr,
    )

    # Load transition region of B: entry_time - transition_duration to entry_time
    b_trans_start = max(0, entry_time - transition_duration_sec)
    audio_b_trans = _load_audio_segment(
        mix_plan.track_b.file_path, b_trans_start, entry_time, sr
    )

    # Load section B: from entry point to section end
    section_b_end = mix_plan.selected_section_b.end
    audio_b_post = _load_audio_segment(
        mix_plan.track_b.file_path, entry_time, section_b_end, sr
    )

    # Dispatch to strategy
    strategy = mix_plan.strategy

    if strategy == TransitionStrategy.STEM_SWAP:
        stems_a = _separate_stems(mix_plan.track_a.file_path)
        stems_b = _separate_stems(mix_plan.track_b.file_path)
        # Trim stems to transition region
        start_sample_a = int(exit_time * sr)
        start_sample_b = int(b_trans_start * sr)
        trimmed_a = {
            k: v[start_sample_a : start_sample_a + transition_samples]
            for k, v in stems_a.items()
        }
        trimmed_b = {
            k: v[start_sample_b : start_sample_b + transition_samples]
            for k, v in stems_b.items()
        }
        transition_audio = _stem_swap(trimmed_a, trimmed_b, sr, transition_bars, bpm)

    elif strategy == TransitionStrategy.RHYTHM_BRIDGE:
        stems_a = _separate_stems(mix_plan.track_a.file_path)
        stems_b = _separate_stems(mix_plan.track_b.file_path)
        start_sample_a = int(exit_time * sr)
        start_sample_b = int(b_trans_start * sr)
        trimmed_a = {
            k: v[start_sample_a : start_sample_a + transition_samples]
            for k, v in stems_a.items()
        }
        trimmed_b = {
            k: v[start_sample_b : start_sample_b + transition_samples]
            for k, v in stems_b.items()
        }
        transition_audio = _rhythm_bridge(
            trimmed_a, trimmed_b, sr, transition_bars, bpm
        )

    elif strategy == TransitionStrategy.PITCH_SHIFT:
        semitones = mix_plan.cue_pair.camelot_distance
        transition_audio = _pitch_shift(
            audio_a_trans, audio_b_trans, sr, semitones, transition_bars, bpm
        )

    elif strategy == TransitionStrategy.HARD_CUT:
        transition_audio = _hard_cut(audio_a_trans, audio_b_trans, sr, bpm)

    elif strategy == TransitionStrategy.BEAT_LOOP:
        transition_audio = _beat_loop(audio_a_trans, audio_b_trans, sr, bpm)

    else:
        # Fallback to beat loop
        transition_audio = _beat_loop(audio_a_trans, audio_b_trans, sr, bpm)

    # Build final audio: [pre-transition A] + [transition] + [post-transition B]
    final_audio = np.concatenate([audio_a_pre, transition_audio, audio_b_post])

    # Normalize to prevent clipping
    peak = np.max(np.abs(final_audio))
    if peak > 0:
        final_audio = final_audio / peak

    # Write output
    sf.write(output_path, final_audio, sr)

    return output_path
