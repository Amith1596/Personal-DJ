"""Audio Analyzer — wraps Essentia and librosa for track analysis.

Responsibilities:
- BPM + beat/downbeat detection via Essentia RhythmExtractor2013
- Key detection via Essentia KeyExtractor
- Segment boundaries via librosa Laplacian segmentation
- Segment labels via energy-based heuristic (position + energy + repetition)
- Composite energy curve via librosa (RMS + spectral centroid + onset strength)
- Returns a fully populated TrackAnalysis model
"""

import numpy as np
import librosa
import essentia.standard as es

from ..models.schemas import KeyInfo, Segment, SegmentLabel, TrackAnalysis
from .mix_planner import CAMELOT_MAP


def analyze_track(file_path: str) -> TrackAnalysis:
    """Top-level entry point. Analyzes a single audio file."""
    # Load audio via librosa (for energy + segmentation)
    y, sr = librosa.load(file_path, sr=44100)
    duration = float(len(y) / sr)

    # BPM + beats via Essentia
    bpm, beats, downbeats = _get_rhythm(file_path)

    # Key detection via Essentia
    key_info = _detect_key(file_path)

    # Composite energy curve
    energy_curve = _compute_energy(y, sr)

    # Segment detection via librosa + label heuristic
    segments = _get_segments(y, sr, energy_curve)

    return TrackAnalysis(
        file_path=file_path,
        bpm=bpm,
        key=key_info,
        segments=segments,
        beats=beats,
        downbeats=downbeats,
        duration=duration,
        energy_curve=energy_curve,
        sample_rate=sr,
    )


def _detect_key(file_path: str) -> KeyInfo:
    """Use Essentia's KeyExtractor to detect key and scale, map to Camelot."""
    audio = es.MonoLoader(filename=file_path, sampleRate=44100)()
    key, scale, _strength = es.KeyExtractor()(audio)
    camelot = CAMELOT_MAP.get((key, scale), "1A")
    return KeyInfo(key=key, scale=scale, camelot=camelot)


def _get_rhythm(file_path: str) -> tuple[float, list[float], list[float]]:
    """Extract BPM, beat timestamps, and downbeat timestamps via Essentia."""
    audio = es.MonoLoader(filename=file_path, sampleRate=44100)()
    rhythm = es.RhythmExtractor2013(method="multifeature")
    bpm, beats, beats_confidence, _, beats_intervals = rhythm(audio)

    # Estimate downbeats: group beats into bars of 4
    downbeats = beats[::4].tolist() if len(beats) >= 4 else beats.tolist()

    return float(bpm), beats.tolist(), downbeats


def _compute_energy(y: np.ndarray, sr: int, hop_length: int = 512) -> list[float]:
    """Compute composite energy: 0.5*RMS + 0.3*spectral_centroid + 0.2*onset_strength."""
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

    # Normalize each to [0, 1]
    rms_n = rms / (rms.max() + 1e-8)
    cent_n = cent / (cent.max() + 1e-8)
    onset_n = onset / (onset.max() + 1e-8)

    composite = 0.5 * rms_n + 0.3 * cent_n + 0.2 * onset_n
    return composite.tolist()


def _get_segments(
    y: np.ndarray, sr: int, energy_curve: list[float], n_segments: int = 6
) -> list[Segment]:
    """Detect segments via librosa Laplacian segmentation, label via energy heuristic.

    Uses chroma features + recurrence matrix to find structural boundaries,
    then labels segments based on position and energy profile.
    """
    # Compute chroma features for structural analysis
    hop_length = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)

    # Build recurrence matrix and Laplacian segmentation
    rec = librosa.segment.recurrence_matrix(chroma, mode="affinity", sym=True)
    boundaries = librosa.segment.agglomerative(chroma, n_segments)
    boundary_times = librosa.frames_to_time(boundaries, sr=sr, hop_length=hop_length)

    duration = float(len(y) / sr)

    # Build segment list from boundary times, filtering zero-length segments
    # Clip boundaries to track duration (librosa frames can overshoot slightly)
    valid_times = [t for t in boundary_times.tolist() if 0 < t < duration]
    all_boundaries = sorted(set([0.0] + valid_times + [duration]))
    segments = []
    for start, end in zip(all_boundaries[:-1], all_boundaries[1:]):
        if end <= start:
            continue
        label = _label_segment(start, end, duration, energy_curve, sr, hop_length)
        segments.append(Segment(label=label, start=round(start, 3), end=round(end, 3)))

    return segments


def _label_segment(
    start: float,
    end: float,
    duration: float,
    energy_curve: list[float],
    sr: int,
    hop_length: int,
) -> SegmentLabel:
    """Heuristic labeling based on position and energy.

    Rules:
    - First segment (starts at 0, low energy) -> INTRO
    - Last segment (ends at duration, low energy) -> OUTRO
    - High energy segments -> CHORUS or DROP
    - Medium energy -> VERSE
    - Low energy mid-track -> BRIDGE
    """
    # Compute average energy for this segment
    energy = np.array(energy_curve)
    fps = sr / hop_length
    start_frame = max(0, int(start * fps))
    end_frame = min(len(energy), int(end * fps))
    if end_frame <= start_frame:
        end_frame = start_frame + 1

    seg_energy = float(np.mean(energy[start_frame:end_frame]))
    global_energy = float(np.mean(energy))

    position_ratio_start = start / duration
    position_ratio_end = end / duration

    # Position-based rules
    if position_ratio_start < 0.05 and seg_energy < global_energy * 0.9:
        return SegmentLabel.INTRO
    if position_ratio_end > 0.95 and seg_energy < global_energy * 0.9:
        return SegmentLabel.OUTRO

    # Energy-based rules
    if seg_energy > global_energy * 1.3:
        return SegmentLabel.CHORUS
    if seg_energy > global_energy * 1.1:
        return SegmentLabel.VERSE
    if seg_energy < global_energy * 0.7:
        return SegmentLabel.BRIDGE

    return SegmentLabel.VERSE
