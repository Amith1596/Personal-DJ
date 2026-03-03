"""Audio Analyzer — wraps allin1, librosa, and Essentia for track analysis.

Responsibilities:
- Structural analysis via allin1 (segments, BPM, beats, downbeats)
- Key detection via Essentia KeyExtractor
- Composite energy curve via librosa (RMS + spectral centroid + onset strength)
- Returns a fully populated TrackAnalysis model
"""

import numpy as np
import allin1
import librosa
import essentia.standard as es

from ..models.schemas import KeyInfo, Segment, SegmentLabel, TrackAnalysis
from .mix_planner import CAMELOT_MAP


def analyze_track(file_path: str) -> TrackAnalysis:
    """Top-level entry point. Analyzes a single audio file."""
    # Structure analysis: segments, BPM, beats, downbeats
    result = allin1.analyze(file_path)

    # Raw audio for energy computation
    y, sr = librosa.load(file_path, sr=None)

    # Key detection via Essentia
    key_info = _detect_key(file_path)

    # Composite energy curve
    energy_curve = _compute_energy(y, sr)

    # Parse allin1 output
    segments = _get_segments(result)
    beats, downbeats = _get_beats(result)

    duration = float(len(y) / sr)

    return TrackAnalysis(
        file_path=file_path,
        bpm=float(result.bpm),
        key=key_info,
        segments=segments,
        beats=beats,
        downbeats=downbeats,
        duration=duration,
        energy_curve=energy_curve,
        sample_rate=int(sr),
    )


def _detect_key(file_path: str) -> KeyInfo:
    """Use Essentia's KeyExtractor to detect key and scale, map to Camelot."""
    audio = es.MonoLoader(filename=file_path, sampleRate=44100)()
    key, scale, _strength = es.KeyExtractor()(audio)

    camelot = CAMELOT_MAP.get((key, scale), "1A")

    return KeyInfo(key=key, scale=scale, camelot=camelot)


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


def _get_segments(result) -> list[Segment]:
    """Convert allin1 analysis result to list of Segment models."""
    # Known labels that map directly to SegmentLabel values
    label_map = {member.value: member for member in SegmentLabel}

    segments = []
    for seg in result.segments:
        label_str = seg.label.lower()
        label = label_map.get(label_str, SegmentLabel.BRIDGE)
        segments.append(Segment(label=label, start=float(seg.start), end=float(seg.end)))
    return segments


def _get_beats(result) -> tuple[list[float], list[float]]:
    """Extract beats and downbeats from allin1 result."""
    beats = [float(b) for b in result.beats]
    downbeats = [float(d) for d in result.downbeats]
    return beats, downbeats
