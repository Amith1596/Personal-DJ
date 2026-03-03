"""Shared test fixtures for Personal DJ v2 backend tests."""

from app.models.schemas import (
    KeyInfo,
    Segment,
    SegmentLabel,
    TrackAnalysis,
)


def _make_energy_curve(length: int, base: float = 0.5, sr: int = 1) -> list[float]:
    """Generate a flat energy curve of given length at `base` level."""
    return [base] * (length * sr)


def _make_segment(
    label: SegmentLabel, start: float, end: float
) -> Segment:
    return Segment(label=label, start=start, end=end)


def _make_analysis(
    bpm: float = 128.0,
    key: str = "C",
    scale: str = "major",
    camelot: str = "8B",
    segments: list[Segment] | None = None,
    energy_base: float = 0.5,
    duration: float = 240.0,
    sr: int = 1,
) -> TrackAnalysis:
    """Build a mock TrackAnalysis with sensible defaults."""
    if segments is None:
        segments = [
            _make_segment(SegmentLabel.INTRO, 0, 30),
            _make_segment(SegmentLabel.VERSE, 30, 90),
            _make_segment(SegmentLabel.CHORUS, 90, 150),
            _make_segment(SegmentLabel.BRIDGE, 150, 180),
            _make_segment(SegmentLabel.CHORUS, 180, 220),
            _make_segment(SegmentLabel.OUTRO, 220, 240),
        ]
    energy_curve = _make_energy_curve(int(duration), base=energy_base, sr=sr)
    beats = [i * (60.0 / bpm) for i in range(int(duration * bpm / 60))]
    downbeats = beats[::4]
    return TrackAnalysis(
        file_path="/mock/track.mp3",
        bpm=bpm,
        key=KeyInfo(key=key, scale=scale, camelot=camelot),
        segments=segments,
        beats=beats,
        downbeats=downbeats,
        duration=duration,
        energy_curve=energy_curve,
        sample_rate=sr,
    )
