"""Pydantic models for the Personal DJ v2 pipeline."""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --- Enums ---


class SegmentLabel(str, Enum):
    INTRO = "intro"
    VERSE = "verse"
    CHORUS = "chorus"
    DROP = "drop"
    BRIDGE = "bridge"
    OUTRO = "outro"


class TransitionStrategy(str, Enum):
    """Strategy selection based on Camelot distance between tracks."""

    STEM_SWAP = "stem_swap"  # Camelot dist 0-1: 8-bar stem-by-stem swap
    RHYTHM_BRIDGE = "rhythm_bridge"  # Camelot dist 2-3: drums+bass only overlap
    PITCH_SHIFT = "pitch_shift"  # Camelot dist 4-5: shift to match key
    HARD_CUT = "hard_cut"  # Camelot dist 6+: clean cut on downbeat
    BEAT_LOOP = "beat_loop"  # Universal fallback: loop last 1-2 bars of A


class MixStatus(str, Enum):
    PENDING = "pending"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    RENDERING = "rendering"
    COMPLETE = "complete"
    FAILED = "failed"


# --- Track Analysis ---


class Segment(BaseModel):
    """A structural segment of a track (intro, verse, chorus, etc.)."""

    label: SegmentLabel
    start: float = Field(description="Start time in seconds")
    end: float = Field(description="End time in seconds")


class KeyInfo(BaseModel):
    """Musical key detected by Essentia KeyExtractor."""

    key: str = Field(description="Key name, e.g. 'C', 'F#'")
    scale: str = Field(description="'major' or 'minor'")
    camelot: str = Field(description="Camelot wheel code, e.g. '8B', '11A'")


class TrackAnalysis(BaseModel):
    """Complete analysis output for a single track."""

    file_path: str
    bpm: float
    key: KeyInfo
    segments: list[Segment]
    beats: list[float] = Field(description="Beat timestamps in seconds")
    downbeats: list[float] = Field(description="Downbeat timestamps in seconds")
    duration: float = Field(description="Total duration in seconds")
    energy_curve: list[float] = Field(
        description="Per-frame energy values (0.5*RMS + 0.3*centroid + 0.2*onset)"
    )
    sample_rate: int


# --- Cue Points & Mix Planning ---


class CuePoint(BaseModel):
    """A scored cue point within a track, tied to a segment boundary."""

    segment: Segment
    time: float = Field(description="Exact cue time in seconds")
    energy: float = Field(description="Energy level at this cue point (0-1)")


class CuePointPair(BaseModel):
    """A scored pair of exit (track A) and entry (track B) cue points."""

    exit_cue: CuePoint
    entry_cue: CuePoint
    score: float = Field(description="Combined cue pair score (0-1)")
    camelot_distance: int
    bpm_delta: float
    energy_delta: float


class MixPlan(BaseModel):
    """The complete plan for mixing two tracks."""

    track_a: TrackAnalysis
    track_b: TrackAnalysis
    selected_section_a: Segment = Field(
        description="Best section of track A to play"
    )
    selected_section_b: Segment = Field(
        description="Best section of track B to play"
    )
    cue_pair: CuePointPair = Field(
        description="Chosen exit/entry cue point pair for the transition"
    )
    strategy: TransitionStrategy
    transition_duration_bars: int = Field(
        default=8, description="Length of transition zone in bars"
    )


# --- API Models (Phase 1) ---


class MixRequest(BaseModel):
    """Request metadata for a mix job. Files uploaded separately."""

    track_a_filename: str
    track_b_filename: str


class MixStatusResponse(BaseModel):
    """Status response for a mix job."""

    job_id: str
    status: MixStatus
    progress: Optional[float] = Field(
        default=None, description="0.0-1.0 progress estimate"
    )
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "2.0.0-spike"
