"""Tests for the transition engine.

All external libraries (demucs, librosa, pyrubberband, soundfile) are mocked.
Tests use synthetic numpy arrays to validate logic without audio files.
"""

import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from app.models.schemas import (
    MixPlan,
    TrackAnalysis,
    TransitionStrategy,
    Segment,
    SegmentLabel,
    KeyInfo,
    CuePoint,
    CuePointPair,
)
from app.services.transition_engine import (
    render_transition,
    _stem_swap,
    _rhythm_bridge,
    _pitch_shift,
    _hard_cut,
    _beat_loop,
    _bars_to_samples,
    _separate_stems,
    _load_audio_segment,
)
from tests.conftest import _make_analysis, _make_segment


# --- Test helpers ---


def _make_mix_plan(strategy=TransitionStrategy.STEM_SWAP):
    """Build a MixPlan with sensible defaults for testing."""
    a = _make_analysis(bpm=128.0, key="C", scale="major", camelot="8B")
    b = _make_analysis(bpm=128.0, key="C", scale="major", camelot="8B")
    seg_a = _make_segment(SegmentLabel.CHORUS, 90, 150)
    seg_b = _make_segment(SegmentLabel.VERSE, 30, 90)
    cue_pair = CuePointPair(
        exit_cue=CuePoint(segment=seg_a, time=150.0, energy=0.8),
        entry_cue=CuePoint(segment=seg_b, time=30.0, energy=0.7),
        score=0.85,
        camelot_distance=0,
        bpm_delta=0.0,
        energy_delta=0.1,
    )
    return MixPlan(
        track_a=a,
        track_b=b,
        selected_section_a=seg_a,
        selected_section_b=seg_b,
        cue_pair=cue_pair,
        strategy=strategy,
    )


def _make_stems(length: int, value: float = 0.5) -> dict[str, np.ndarray]:
    """Create a dict of synthetic stems, all same length and value."""
    return {
        "vocals": np.full(length, value),
        "drums": np.full(length, value),
        "bass": np.full(length, value),
        "other": np.full(length, value),
    }


# --- TestBarsToSamples ---


class TestBarsToSamples:
    def test_one_bar_at_120bpm_44100sr(self):
        # 1 bar = 4 beats. At 120 BPM, 1 beat = 0.5s, so 4 beats = 2s.
        # 2s * 44100 = 88200 samples.
        result = _bars_to_samples(1, 120.0, 44100)
        assert result == 88200

    def test_eight_bars_at_128bpm(self):
        # 8 bars = 32 beats. At 128 BPM, 1 beat = 60/128 = 0.46875s.
        # 32 beats = 15s. 15 * 44100 = 661500.
        result = _bars_to_samples(8, 128.0, 44100)
        assert result == 661500


# --- TestStemSwap ---


class TestStemSwap:
    def test_output_length(self):
        sr = 44100
        bpm = 128.0
        transition_bars = 8
        total_samples = _bars_to_samples(transition_bars, bpm, sr)
        stems_a = _make_stems(total_samples, value=1.0)
        stems_b = _make_stems(total_samples, value=0.0)
        result = _stem_swap(stems_a, stems_b, sr, transition_bars, bpm)
        assert len(result) == total_samples

    def test_starts_with_a_ends_with_b(self):
        sr = 44100
        bpm = 128.0
        transition_bars = 8
        total_samples = _bars_to_samples(transition_bars, bpm, sr)

        # A stems all 1.0, B stems all 0.0
        stems_a = _make_stems(total_samples, value=1.0)
        stems_b = _make_stems(total_samples, value=0.0)

        result = _stem_swap(stems_a, stems_b, sr, transition_bars, bpm)

        # At sample 0, output should be dominated by A (sum of 4 stems * 1.0 = ~4.0)
        # At the end, output should be dominated by B (sum of 4 stems * 0.0 = ~0.0)
        start_val = result[0]
        end_val = result[-1]
        assert start_val > end_val

    def test_crossfade_progresses(self):
        """Values at 25% through should be more A-like than at 75%."""
        sr = 44100
        bpm = 128.0
        transition_bars = 8
        total_samples = _bars_to_samples(transition_bars, bpm, sr)
        stems_a = _make_stems(total_samples, value=1.0)
        stems_b = _make_stems(total_samples, value=0.0)
        result = _stem_swap(stems_a, stems_b, sr, transition_bars, bpm)

        quarter = total_samples // 4
        three_quarter = 3 * total_samples // 4
        assert result[quarter] > result[three_quarter]


# --- TestRhythmBridge ---


class TestRhythmBridge:
    def test_output_length(self):
        sr = 44100
        bpm = 128.0
        transition_bars = 8
        total_samples = _bars_to_samples(transition_bars, bpm, sr)
        stems_a = _make_stems(total_samples, value=0.5)
        stems_b = _make_stems(total_samples, value=0.5)
        result = _rhythm_bridge(stems_a, stems_b, sr, transition_bars, bpm)
        assert len(result) == total_samples

    def test_middle_section_is_drums_bass_only(self):
        """In the middle third, melodic content (vocals+other) should be
        attenuated relative to the start."""
        sr = 44100
        bpm = 128.0
        transition_bars = 8
        total_samples = _bars_to_samples(transition_bars, bpm, sr)

        # Set melodic stems to 1.0, rhythmic stems to 0.0
        # This way we can detect where melodic content drops out.
        stems_a = {
            "vocals": np.ones(total_samples),
            "other": np.ones(total_samples),
            "drums": np.zeros(total_samples),
            "bass": np.zeros(total_samples),
        }
        stems_b = {
            "vocals": np.ones(total_samples),
            "other": np.ones(total_samples),
            "drums": np.zeros(total_samples),
            "bass": np.zeros(total_samples),
        }

        result = _rhythm_bridge(stems_a, stems_b, sr, transition_bars, bpm)

        third = total_samples // 3
        # Middle third should have near-zero melodic content
        mid_section = result[third : 2 * third]
        start_section = result[:100]
        # Start should have melodic content (A's vocals+other at full)
        assert np.mean(np.abs(start_section)) > np.mean(np.abs(mid_section))


# --- TestPitchShift ---


class TestPitchShift:
    @patch("app.services.transition_engine.pyrubberband")
    def test_calls_pyrubberband(self, mock_pyrubberband):
        sr = 44100
        bpm = 128.0
        transition_bars = 8
        total_samples = _bars_to_samples(transition_bars, bpm, sr)
        audio_a = np.ones(total_samples)
        audio_b = np.ones(total_samples)
        semitones = 3.0

        mock_pyrubberband.pitch_shift.return_value = np.ones(total_samples)

        _pitch_shift(audio_a, audio_b, sr, semitones, transition_bars, bpm)

        mock_pyrubberband.pitch_shift.assert_called_once()
        call_args = mock_pyrubberband.pitch_shift.call_args
        assert call_args[0][1] == sr
        assert call_args[1]["n_steps"] == semitones

    @patch("app.services.transition_engine.pyrubberband")
    def test_output_length(self, mock_pyrubberband):
        sr = 44100
        bpm = 128.0
        transition_bars = 8
        total_samples = _bars_to_samples(transition_bars, bpm, sr)
        audio_a = np.ones(total_samples)
        audio_b = np.ones(total_samples)

        mock_pyrubberband.pitch_shift.return_value = np.ones(total_samples)

        result = _pitch_shift(audio_a, audio_b, sr, 2.0, transition_bars, bpm)
        assert len(result) == total_samples


# --- TestHardCut ---


class TestHardCut:
    def test_output_length(self):
        sr = 44100
        bpm = 128.0
        audio_a = np.ones(sr)  # 1 second
        audio_b = np.ones(sr)  # 1 second
        result = _hard_cut(audio_a, audio_b, sr, bpm)
        # Hard cut concatenates A and B
        assert len(result) == len(audio_a) + len(audio_b)

    def test_no_clicks(self):
        """The junction between A and B should not have a large discontinuity."""
        sr = 44100
        bpm = 128.0
        audio_a = np.ones(sr) * 0.8
        audio_b = np.ones(sr) * 0.8
        result = _hard_cut(audio_a, audio_b, sr, bpm)

        # At the junction, A should have faded to ~0 and B should start at ~0
        junction = len(audio_a)
        last_a = result[junction - 1]
        first_b = result[junction]
        # Both should be near zero due to fades
        assert abs(last_a) < 0.1
        assert abs(first_b) < 0.1

    def test_fade_applied(self):
        """Fade regions should not be at full amplitude."""
        sr = 44100
        bpm = 128.0
        fade_samples = int(0.05 * sr)
        audio_a = np.ones(sr)
        audio_b = np.ones(sr)
        result = _hard_cut(audio_a, audio_b, sr, bpm)

        # Last sample of A's fade-out region should be near 0
        assert result[len(audio_a) - 1] < 0.05
        # First sample of B's fade-in region should be near 0
        assert result[len(audio_a)] < 0.05


# --- TestBeatLoop ---


class TestBeatLoop:
    def test_loops_correct_bars(self):
        """The loop section should contain repeated audio from the end of A."""
        sr = 44100
        bpm = 128.0
        loop_bars = 2
        loop_samples = _bars_to_samples(loop_bars, bpm, sr)

        # Create A with a recognizable pattern at the end
        audio_a = np.zeros(loop_samples * 4)
        # Fill last loop_bars with a distinctive value
        audio_a[-loop_samples:] = 0.7

        audio_b = np.ones(loop_samples * 2) * 0.5

        result = _beat_loop(audio_a, audio_b, sr, bpm, loop_bars=loop_bars)

        # The beginning of the result should contain the looped pattern
        # (before B's fade-in dominates)
        # At sample 0, loop contributes at full (fade=0), B contributes 0
        assert result[0] == pytest.approx(0.7, abs=0.01)

    def test_output_length(self):
        sr = 44100
        bpm = 128.0
        loop_bars = 2
        loop_samples = _bars_to_samples(loop_bars, bpm, sr)
        audio_a = np.ones(loop_samples * 4)
        audio_b = np.ones(loop_samples * 3)

        result = _beat_loop(audio_a, audio_b, sr, bpm, loop_bars=loop_bars)
        # Output length matches B's length (the transition zone)
        assert len(result) == len(audio_b)


# --- TestSeparateStems ---


class TestSeparateStems:
    @patch("app.services.transition_engine.sf")
    @patch("app.services.transition_engine.subprocess")
    def test_returns_four_stems(self, mock_subprocess, mock_sf):
        """Mocked demucs should return a dict with four stem keys."""
        mock_subprocess.run.return_value = MagicMock(returncode=0)

        # Mock sf.read to return a 1D array for each stem
        mock_sf.read.return_value = (np.ones(44100), 44100)

        with patch("app.services.transition_engine.Path") as mock_path_cls:
            # Mock Path so stem_dir / "vocals.wav" etc. return string paths
            mock_path_instance = MagicMock()
            mock_path_cls.return_value = mock_path_instance
            mock_path_instance.stem = "test_track"
            # Make Path(tmpdir) / ... chain work
            mock_path_cls.side_effect = lambda x: mock_path_instance

            # We need to also handle the tmpdir Path construction
            # Simplify by patching tempfile.TemporaryDirectory
            with patch(
                "app.services.transition_engine.tempfile.TemporaryDirectory"
            ) as mock_tmpdir:
                mock_tmpdir.return_value.__enter__ = MagicMock(
                    return_value="/tmp/fake"
                )
                mock_tmpdir.return_value.__exit__ = MagicMock(return_value=False)

                result = _separate_stems("/fake/track.mp3")

        assert "vocals" in result
        assert "drums" in result
        assert "bass" in result
        assert "other" in result

    @patch("app.services.transition_engine.sf")
    @patch("app.services.transition_engine.subprocess")
    def test_stem_shapes_match(self, mock_subprocess, mock_sf):
        """All stems should have the same shape."""
        mock_subprocess.run.return_value = MagicMock(returncode=0)
        mock_sf.read.return_value = (np.ones(44100), 44100)

        with patch("app.services.transition_engine.Path") as mock_path_cls:
            mock_path_instance = MagicMock()
            mock_path_cls.return_value = mock_path_instance
            mock_path_instance.stem = "test_track"
            mock_path_cls.side_effect = lambda x: mock_path_instance

            with patch(
                "app.services.transition_engine.tempfile.TemporaryDirectory"
            ) as mock_tmpdir:
                mock_tmpdir.return_value.__enter__ = MagicMock(
                    return_value="/tmp/fake"
                )
                mock_tmpdir.return_value.__exit__ = MagicMock(return_value=False)

                result = _separate_stems("/fake/track.mp3")

        shapes = [v.shape for v in result.values()]
        assert all(s == shapes[0] for s in shapes)


# --- TestRenderTransition (integration) ---


class TestRenderTransition:
    def _patch_all(self):
        """Return a dict of common patches for render_transition tests."""
        return {
            "load": patch(
                "app.services.transition_engine._load_audio_segment",
                return_value=np.ones(44100 * 5),
            ),
            "sf_write": patch("app.services.transition_engine.sf.write"),
            "separate": patch(
                "app.services.transition_engine._separate_stems",
                return_value=_make_stems(661500, value=0.5),
            ),
        }

    def test_dispatches_stem_swap(self):
        plan = _make_mix_plan(strategy=TransitionStrategy.STEM_SWAP)
        patches = self._patch_all()

        with patches["load"], patches["sf_write"], patches["separate"]:
            with patch(
                "app.services.transition_engine._stem_swap",
                return_value=np.ones(661500),
            ) as mock_swap:
                render_transition(plan, "/tmp/out.wav")
                mock_swap.assert_called_once()

    def test_dispatches_hard_cut(self):
        plan = _make_mix_plan(strategy=TransitionStrategy.HARD_CUT)
        patches = self._patch_all()

        with patches["load"], patches["sf_write"]:
            with patch(
                "app.services.transition_engine._hard_cut",
                return_value=np.ones(44100),
            ) as mock_cut:
                render_transition(plan, "/tmp/out.wav")
                mock_cut.assert_called_once()

    def test_writes_output_file(self):
        plan = _make_mix_plan(strategy=TransitionStrategy.HARD_CUT)
        patches = self._patch_all()

        with patches["load"], patches["sf_write"] as mock_write:
            with patch(
                "app.services.transition_engine._hard_cut",
                return_value=np.ones(44100),
            ):
                render_transition(plan, "/tmp/out.wav")
                mock_write.assert_called_once()
                # First arg should be the output path
                assert mock_write.call_args[0][0] == "/tmp/out.wav"

    def test_returns_output_path(self):
        plan = _make_mix_plan(strategy=TransitionStrategy.HARD_CUT)
        patches = self._patch_all()

        with patches["load"], patches["sf_write"]:
            with patch(
                "app.services.transition_engine._hard_cut",
                return_value=np.ones(44100),
            ):
                result = render_transition(plan, "/tmp/out.wav")
                assert result == "/tmp/out.wav"

    def test_dispatches_rhythm_bridge(self):
        plan = _make_mix_plan(strategy=TransitionStrategy.RHYTHM_BRIDGE)
        patches = self._patch_all()

        with patches["load"], patches["sf_write"], patches["separate"]:
            with patch(
                "app.services.transition_engine._rhythm_bridge",
                return_value=np.ones(661500),
            ) as mock_bridge:
                render_transition(plan, "/tmp/out.wav")
                mock_bridge.assert_called_once()

    def test_dispatches_pitch_shift(self):
        plan = _make_mix_plan(strategy=TransitionStrategy.PITCH_SHIFT)
        patches = self._patch_all()

        with patches["load"], patches["sf_write"]:
            with patch(
                "app.services.transition_engine._pitch_shift",
                return_value=np.ones(661500),
            ) as mock_ps:
                render_transition(plan, "/tmp/out.wav")
                mock_ps.assert_called_once()

    def test_dispatches_beat_loop(self):
        plan = _make_mix_plan(strategy=TransitionStrategy.BEAT_LOOP)
        patches = self._patch_all()

        with patches["load"], patches["sf_write"]:
            with patch(
                "app.services.transition_engine._beat_loop",
                return_value=np.ones(661500),
            ) as mock_loop:
                render_transition(plan, "/tmp/out.wav")
                mock_loop.assert_called_once()
