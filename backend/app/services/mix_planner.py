"""Mix Planner — the "DJ brain" for Personal DJ v2.

Responsibilities:
- Score segments to find the best section of each track
- Compute Camelot wheel distance between keys
- Score all (exit_cue, entry_cue) pairs across two tracks
- Select the transition strategy based on harmonic compatibility
- Produce a complete MixPlan
"""

import numpy as np

from ..models.schemas import (
    CuePoint,
    CuePointPair,
    MixPlan,
    Segment,
    SegmentLabel,
    TrackAnalysis,
    TransitionStrategy,
)

# --- Constants ---

TYPE_WEIGHTS: dict[SegmentLabel, float] = {
    SegmentLabel.CHORUS: 1.0,
    SegmentLabel.DROP: 1.0,
    SegmentLabel.VERSE: 0.7,
    SegmentLabel.BRIDGE: 0.5,
    SegmentLabel.INTRO: 0.2,
    SegmentLabel.OUTRO: 0.2,
}

# Camelot wheel: maps (key, scale) → camelot code.
# Number encodes the position on the wheel (1-12), letter encodes mode.
CAMELOT_MAP: dict[tuple[str, str], str] = {
    ("Ab", "minor"): "1A",
    ("B", "major"): "1B",
    ("Eb", "minor"): "2A",
    ("F#", "major"): "2B",
    ("Bb", "minor"): "3A",
    ("Db", "major"): "3B",
    ("F", "minor"): "4A",
    ("Ab", "major"): "4B",
    ("C", "minor"): "5A",
    ("Eb", "major"): "5B",
    ("G", "minor"): "6A",
    ("Bb", "major"): "6B",
    ("D", "minor"): "7A",
    ("F", "major"): "7B",
    ("A", "minor"): "8A",
    ("C", "major"): "8B",
    ("E", "minor"): "9A",
    ("G", "major"): "9B",
    ("B", "minor"): "10A",
    ("D", "major"): "10B",
    ("F#", "minor"): "11A",
    ("A", "major"): "11B",
    ("Db", "minor"): "12A",
    ("E", "major"): "12B",
}

CUE_PAIR_WEIGHTS = {
    "camelot": 0.30,
    "energy": 0.25,
    "bpm": 0.25,
    "structural": 0.20,
}

# Segments that make good exit points (end of track A's best section)
EXIT_LABELS = {SegmentLabel.CHORUS, SegmentLabel.DROP}
# Segments that make good entry points (start of track B's best section)
ENTRY_LABELS = {SegmentLabel.VERSE, SegmentLabel.INTRO, SegmentLabel.BRIDGE}


# --- Section Scoring ---


def score_segment(segment: Segment, energy_curve: np.ndarray, fps: float) -> float:
    """Score a segment by type weight, average energy, and duration penalty.

    fps = frames per second in the energy curve (len(energy_curve) / duration).
    Returns a float >= 0. Higher is better.
    """
    weight = TYPE_WEIGHTS.get(segment.label, 0.5)

    start_frame = int(segment.start * fps)
    end_frame = int(segment.end * fps)
    # Clamp to energy curve bounds
    start_frame = max(0, min(start_frame, len(energy_curve) - 1))
    end_frame = max(start_frame + 1, min(end_frame, len(energy_curve)))

    avg_energy = float(np.mean(energy_curve[start_frame:end_frame]))

    duration = segment.end - segment.start
    dur_penalty = 1.0 if 15.0 <= duration <= 90.0 else 0.7

    return weight * avg_energy * dur_penalty


def select_best_section(analysis: TrackAnalysis) -> Segment:
    """Pick the highest-scoring segment from a track's analysis."""
    energy = np.array(analysis.energy_curve)
    # Energy curve is frame-indexed, not sample-indexed. Derive fps from data.
    fps = len(energy) / analysis.duration if analysis.duration > 0 else 1.0
    scored = [
        (seg, score_segment(seg, energy, fps))
        for seg in analysis.segments
        if seg.end > seg.start  # skip zero-length segments
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[0][0]


# --- Camelot Wheel ---


def parse_camelot(code: str) -> tuple[int, str]:
    """Parse a Camelot code like '8B' into (number, letter)."""
    letter = code[-1].upper()
    number = int(code[:-1])
    return number, letter


def camelot_distance(code_a: str, code_b: str) -> int:
    """Compute the minimum distance on the Camelot wheel between two codes.

    Same number + different letter (e.g. 8A ↔ 8B) = 1 step (relative major/minor).
    Same letter, different number = circular distance (mod 12).
    Different letter + different number = cross-mode distance + 1.
    """
    num_a, letter_a = parse_camelot(code_a)
    num_b, letter_b = parse_camelot(code_b)

    # Circular distance on the wheel (12 positions)
    circle_dist = min(abs(num_a - num_b), 12 - abs(num_a - num_b))

    if letter_a == letter_b:
        return circle_dist
    # Mode switch costs 1 step (relative major/minor)
    if circle_dist == 0:
        return 1
    return circle_dist + 1


# --- Cue Point Scoring ---


def _energy_at_time(time: float, energy_curve: np.ndarray, fps: float) -> float:
    """Sample the energy curve at a given time. fps = frames per second."""
    idx = int(time * fps)
    idx = max(0, min(idx, len(energy_curve) - 1))
    return float(energy_curve[idx])


def build_cue_points(analysis: TrackAnalysis) -> list[CuePoint]:
    """Build candidate cue points at every segment boundary."""
    energy = np.array(analysis.energy_curve)
    fps = len(energy) / analysis.duration if analysis.duration > 0 else 1.0
    cues = []
    for seg in analysis.segments:
        if seg.end <= seg.start:
            continue  # skip zero-length segments
        # Cue at segment start
        e = _energy_at_time(seg.start, energy, fps)
        cues.append(CuePoint(segment=seg, time=seg.start, energy=e))
        # Cue at segment end
        e = _energy_at_time(seg.end, energy, fps)
        cues.append(CuePoint(segment=seg, time=seg.end, energy=e))
    return cues


def score_cue_pair(
    exit_cue: CuePoint,
    entry_cue: CuePoint,
    key_a: str,
    key_b: str,
    bpm_a: float,
    bpm_b: float,
) -> CuePointPair:
    """Score a candidate (exit_A, entry_B) cue point pair."""
    cam_dist = camelot_distance(key_a, key_b)
    camelot_score = max(0.0, 1.0 - cam_dist / 6.0)

    energy_score = 1.0 - abs(exit_cue.energy - entry_cue.energy)

    bpm_delta = abs(bpm_a - bpm_b)
    bpm_score = 1.0 - min(bpm_delta / 20.0, 1.0)

    struct_a = 1.0 if exit_cue.segment.label in EXIT_LABELS else 0.5
    struct_b = 1.0 if entry_cue.segment.label in ENTRY_LABELS else 0.5
    struct_score = (struct_a + struct_b) / 2.0

    w = CUE_PAIR_WEIGHTS
    total = (
        w["camelot"] * camelot_score
        + w["energy"] * energy_score
        + w["bpm"] * bpm_score
        + w["structural"] * struct_score
    )

    return CuePointPair(
        exit_cue=exit_cue,
        entry_cue=entry_cue,
        score=round(total, 4),
        camelot_distance=cam_dist,
        bpm_delta=round(bpm_delta, 2),
        energy_delta=round(abs(exit_cue.energy - entry_cue.energy), 4),
    )


def select_best_cue_pair(
    analysis_a: TrackAnalysis,
    analysis_b: TrackAnalysis,
) -> CuePointPair:
    """Score all (exit_A, entry_B) pairs and return the best one."""
    cues_a = build_cue_points(analysis_a)
    cues_b = build_cue_points(analysis_b)

    key_a = analysis_a.key.camelot
    key_b = analysis_b.key.camelot

    best: CuePointPair | None = None
    for exit_cue in cues_a:
        for entry_cue in cues_b:
            pair = score_cue_pair(
                exit_cue, entry_cue, key_a, key_b, analysis_a.bpm, analysis_b.bpm
            )
            if best is None or pair.score > best.score:
                best = pair

    if best is None:
        raise ValueError("No cue point pairs found. Both tracks need at least one segment.")
    return best


# --- Strategy Selection ---


def select_strategy(camelot_dist: int) -> TransitionStrategy:
    """Pick a transition strategy based on harmonic distance."""
    if camelot_dist <= 1:
        return TransitionStrategy.STEM_SWAP
    if camelot_dist <= 3:
        return TransitionStrategy.RHYTHM_BRIDGE
    if camelot_dist <= 5:
        return TransitionStrategy.PITCH_SHIFT
    return TransitionStrategy.HARD_CUT


# --- Top-Level Planner ---


def create_mix_plan(
    analysis_a: TrackAnalysis,
    analysis_b: TrackAnalysis,
) -> MixPlan:
    """Run the full planning pipeline: score sections, pick cue points, choose strategy."""
    section_a = select_best_section(analysis_a)
    section_b = select_best_section(analysis_b)

    cue_pair = select_best_cue_pair(analysis_a, analysis_b)

    strategy = select_strategy(cue_pair.camelot_distance)

    return MixPlan(
        track_a=analysis_a,
        track_b=analysis_b,
        selected_section_a=section_a,
        selected_section_b=section_b,
        cue_pair=cue_pair,
        strategy=strategy,
    )
