"""Tests for the mix planner — the DJ brain.

Uses mock TrackAnalysis data so no audio files or ML models are needed.
"""

import pytest

from app.models.schemas import (
    CuePoint,
    KeyInfo,
    Segment,
    SegmentLabel,
    TrackAnalysis,
    TransitionStrategy,
)
from app.services.mix_planner import (
    build_cue_points,
    camelot_distance,
    create_mix_plan,
    parse_camelot,
    score_cue_pair,
    score_segment,
    select_best_cue_pair,
    select_best_section,
    select_strategy,
)
from tests.conftest import _make_analysis, _make_energy_curve, _make_segment


# --- score_segment ---


class TestScoreSegment:
    def test_chorus_scores_higher_than_intro(self):
        sr = 1
        energy = [0.5] * 240
        chorus = _make_segment(SegmentLabel.CHORUS, 30, 60)
        intro = _make_segment(SegmentLabel.INTRO, 0, 30)
        assert score_segment(chorus, energy, sr) > score_segment(intro, energy, sr)

    def test_higher_energy_scores_higher(self):
        import numpy as np

        sr = 1
        energy = np.zeros(240)
        energy[30:60] = 0.9  # high-energy zone
        energy[60:90] = 0.2  # low-energy zone
        seg_high = _make_segment(SegmentLabel.VERSE, 30, 60)
        seg_low = _make_segment(SegmentLabel.VERSE, 60, 90)
        assert score_segment(seg_high, energy, sr) > score_segment(seg_low, energy, sr)

    def test_short_segment_gets_duration_penalty(self):
        sr = 1
        energy = [0.5] * 240
        short = _make_segment(SegmentLabel.CHORUS, 10, 20)  # 10s < 15s threshold
        normal = _make_segment(SegmentLabel.CHORUS, 30, 60)  # 30s, within range
        assert score_segment(normal, energy, sr) > score_segment(short, energy, sr)

    def test_long_segment_gets_duration_penalty(self):
        sr = 1
        energy = [0.5] * 300
        long = _make_segment(SegmentLabel.CHORUS, 0, 100)  # 100s > 90s threshold
        normal = _make_segment(SegmentLabel.CHORUS, 100, 160)  # 60s, within range
        assert score_segment(normal, energy, sr) > score_segment(long, energy, sr)

    def test_zero_energy_returns_zero(self):
        sr = 1
        energy = [0.0] * 240
        seg = _make_segment(SegmentLabel.CHORUS, 30, 60)
        assert score_segment(seg, energy, sr) == 0.0


# --- select_best_section ---


class TestSelectBestSection:
    def test_picks_chorus_over_intro_equal_energy(self):
        analysis = _make_analysis(energy_base=0.6)
        best = select_best_section(analysis)
        assert best.label == SegmentLabel.CHORUS

    def test_picks_high_energy_verse_over_low_energy_chorus(self):
        import numpy as np

        sr = 1
        duration = 120
        energy = np.zeros(duration * sr)
        energy[0:60] = 0.95  # verse region: very high energy
        energy[60:120] = 0.1  # chorus region: very low energy

        segments = [
            _make_segment(SegmentLabel.VERSE, 0, 60),
            _make_segment(SegmentLabel.CHORUS, 60, 120),
        ]
        analysis = _make_analysis(
            segments=segments, duration=float(duration), sr=sr, energy_base=0.0
        )
        # Override the energy curve with our custom one
        analysis.energy_curve = energy.tolist()
        best = select_best_section(analysis)
        assert best.label == SegmentLabel.VERSE


# --- Camelot wheel ---


class TestCamelotDistance:
    def test_same_key_is_zero(self):
        assert camelot_distance("8B", "8B") == 0

    def test_relative_major_minor_is_one(self):
        # 8A (Am) and 8B (C) are relative major/minor
        assert camelot_distance("8A", "8B") == 1

    def test_adjacent_same_mode_is_one(self):
        assert camelot_distance("8B", "9B") == 1

    def test_wrap_around(self):
        # 1B and 12B should be distance 1 (wraps around the wheel)
        assert camelot_distance("1B", "12B") == 1

    def test_opposite_same_mode(self):
        # 1B and 7B: distance 6 on a 12-position wheel
        assert camelot_distance("1B", "7B") == 6

    def test_cross_mode_adjacent_numbers(self):
        # 8A and 9B: circle dist 1 + mode switch 1 = 2
        assert camelot_distance("8A", "9B") == 2

    def test_parse_camelot(self):
        assert parse_camelot("8B") == (8, "B")
        assert parse_camelot("12A") == (12, "A")
        assert parse_camelot("1B") == (1, "B")


# --- score_cue_pair ---


class TestScoreCuePair:
    def test_perfect_match_scores_high(self):
        exit_cue = CuePoint(
            segment=_make_segment(SegmentLabel.CHORUS, 90, 150),
            time=150.0,
            energy=0.8,
        )
        entry_cue = CuePoint(
            segment=_make_segment(SegmentLabel.VERSE, 30, 90),
            time=30.0,
            energy=0.8,
        )
        pair = score_cue_pair(exit_cue, entry_cue, "8B", "8B", 128.0, 128.0)
        # Same key, same BPM, same energy, good structural labels
        assert pair.score > 0.9

    def test_bad_key_match_scores_lower(self):
        exit_cue = CuePoint(
            segment=_make_segment(SegmentLabel.CHORUS, 90, 150),
            time=150.0,
            energy=0.8,
        )
        entry_cue = CuePoint(
            segment=_make_segment(SegmentLabel.VERSE, 30, 90),
            time=30.0,
            energy=0.8,
        )
        good = score_cue_pair(exit_cue, entry_cue, "8B", "8B", 128.0, 128.0)
        bad = score_cue_pair(exit_cue, entry_cue, "8B", "2A", 128.0, 128.0)
        assert good.score > bad.score

    def test_large_bpm_delta_penalized(self):
        exit_cue = CuePoint(
            segment=_make_segment(SegmentLabel.CHORUS, 90, 150),
            time=150.0,
            energy=0.7,
        )
        entry_cue = CuePoint(
            segment=_make_segment(SegmentLabel.VERSE, 30, 90),
            time=30.0,
            energy=0.7,
        )
        close_bpm = score_cue_pair(exit_cue, entry_cue, "8B", "8B", 128.0, 130.0)
        far_bpm = score_cue_pair(exit_cue, entry_cue, "8B", "8B", 128.0, 150.0)
        assert close_bpm.score > far_bpm.score

    def test_energy_delta_recorded(self):
        exit_cue = CuePoint(
            segment=_make_segment(SegmentLabel.CHORUS, 90, 150),
            time=150.0,
            energy=0.9,
        )
        entry_cue = CuePoint(
            segment=_make_segment(SegmentLabel.VERSE, 30, 90),
            time=30.0,
            energy=0.3,
        )
        pair = score_cue_pair(exit_cue, entry_cue, "8B", "8B", 128.0, 128.0)
        assert pair.energy_delta == pytest.approx(0.6, abs=0.01)


# --- select_strategy ---


class TestSelectStrategy:
    def test_same_key_uses_stem_swap(self):
        assert select_strategy(0) == TransitionStrategy.STEM_SWAP

    def test_close_key_uses_stem_swap(self):
        assert select_strategy(1) == TransitionStrategy.STEM_SWAP

    def test_medium_distance_uses_rhythm_bridge(self):
        assert select_strategy(2) == TransitionStrategy.RHYTHM_BRIDGE
        assert select_strategy(3) == TransitionStrategy.RHYTHM_BRIDGE

    def test_far_key_uses_pitch_shift(self):
        assert select_strategy(4) == TransitionStrategy.PITCH_SHIFT
        assert select_strategy(5) == TransitionStrategy.PITCH_SHIFT

    def test_very_far_key_uses_hard_cut(self):
        assert select_strategy(6) == TransitionStrategy.HARD_CUT
        assert select_strategy(7) == TransitionStrategy.HARD_CUT


# --- build_cue_points ---


class TestBuildCuePoints:
    def test_creates_two_cues_per_segment(self):
        analysis = _make_analysis()
        cues = build_cue_points(analysis)
        # 6 segments × 2 boundaries = 12 cue points
        assert len(cues) == 12

    def test_cue_times_match_segment_boundaries(self):
        segments = [
            _make_segment(SegmentLabel.VERSE, 10, 50),
            _make_segment(SegmentLabel.CHORUS, 50, 100),
        ]
        analysis = _make_analysis(segments=segments, duration=100.0)
        cues = build_cue_points(analysis)
        times = [c.time for c in cues]
        assert 10.0 in times
        assert 50.0 in times
        assert 100.0 in times


# --- select_best_cue_pair ---


class TestSelectBestCuePair:
    def test_returns_highest_scoring_pair(self):
        a = _make_analysis(bpm=128.0, camelot="8B", energy_base=0.7)
        b = _make_analysis(bpm=128.0, camelot="8B", energy_base=0.7)
        pair = select_best_cue_pair(a, b)
        assert pair.score > 0
        assert pair.camelot_distance == 0

    def test_mismatched_keys_still_returns_a_pair(self):
        a = _make_analysis(bpm=128.0, camelot="8B", key="C", scale="major")
        b = _make_analysis(bpm=140.0, camelot="2A", key="Eb", scale="minor")
        pair = select_best_cue_pair(a, b)
        assert pair.score > 0
        assert pair.camelot_distance > 0


# --- create_mix_plan (integration) ---


class TestCreateMixPlan:
    def test_produces_valid_plan(self):
        a = _make_analysis(bpm=126.0, camelot="8B", key="C", scale="major")
        b = _make_analysis(bpm=128.0, camelot="9B", key="G", scale="major")
        plan = create_mix_plan(a, b)

        assert plan.selected_section_a.label == SegmentLabel.CHORUS
        assert plan.selected_section_b.label == SegmentLabel.CHORUS
        assert plan.cue_pair.score > 0
        assert plan.strategy == TransitionStrategy.STEM_SWAP  # camelot dist 1

    def test_far_keys_get_hard_cut(self):
        a = _make_analysis(bpm=128.0, camelot="1B")
        b = _make_analysis(bpm=128.0, camelot="7A")
        plan = create_mix_plan(a, b)
        assert plan.strategy == TransitionStrategy.HARD_CUT

    def test_medium_keys_get_rhythm_bridge(self):
        a = _make_analysis(bpm=128.0, camelot="8B")
        b = _make_analysis(bpm=128.0, camelot="10A")
        plan = create_mix_plan(a, b)
        # 8B → 10A: circle dist 2 + mode switch = 3
        assert plan.strategy == TransitionStrategy.RHYTHM_BRIDGE

    def test_plan_preserves_track_references(self):
        a = _make_analysis(bpm=120.0, camelot="5A")
        b = _make_analysis(bpm=122.0, camelot="5B")
        plan = create_mix_plan(a, b)
        assert plan.track_a.bpm == 120.0
        assert plan.track_b.bpm == 122.0
