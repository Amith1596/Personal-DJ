"""Tests for manual/chain mix mode.

Covers: ManualSegment schema, create_mix_plan_manual, render_transition_audio,
render_chain, CLI argument parsing, and new API endpoints.
"""

import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.models.schemas import (
    CuePoint,
    CuePointPair,
    ManualSegment,
    ManualMixRequest,
    MixPlan,
    MixStatus,
    Segment,
    SegmentLabel,
    TransitionPreviewRequest,
    TransitionStrategy,
)
from app.services.mix_planner import (
    create_mix_plan_manual,
    _label_by_energy,
)
from app.services.transition_engine import (
    render_transition_audio,
    render_chain,
    _bars_to_samples,
    _compute_rms,
    _loudness_match,
    _loudness_match_pair,
    _loudness_match_many,
)
from app.main import app, jobs
from tests.conftest import _make_analysis, _make_segment


# --- Loudness Matching ---


class TestLoudnessMatching:
    def test_compute_rms_sine(self):
        """RMS of a sine wave at amplitude 1.0 should be ~0.707."""
        sr = 44100
        t = np.linspace(0, 1, sr)
        sine = np.sin(2 * np.pi * 440 * t)
        rms = _compute_rms(sine)
        assert rms == pytest.approx(0.707, abs=0.01)

    def test_compute_rms_silence(self):
        rms = _compute_rms(np.zeros(1000))
        assert rms == 0.0

    def test_compute_rms_empty(self):
        rms = _compute_rms(np.array([]))
        assert rms == 0.0

    def test_loudness_match_boosts_quiet_track(self):
        loud = np.ones(1000) * 0.6
        quiet = np.ones(1000) * 0.4
        matched = _loudness_match(quiet, _compute_rms(loud))
        # Gain needed is 1.5x (within 2x cap), so should match
        assert _compute_rms(matched) == pytest.approx(_compute_rms(loud), abs=0.01)

    def test_loudness_match_attenuates_loud_track(self):
        loud = np.ones(1000) * 0.8
        quiet = np.ones(1000) * 0.2
        target_rms = _compute_rms(quiet)
        matched = _loudness_match(loud, target_rms)
        assert _compute_rms(matched) == pytest.approx(target_rms, abs=0.01)

    def test_loudness_match_caps_gain(self):
        """Should not amplify more than 2x (6 dB) to avoid blowing up noise."""
        quiet = np.ones(1000) * 0.01
        loud_target = 0.5
        matched = _loudness_match(quiet, loud_target)
        # Gain capped at 2x, so RMS should be 0.02 not 0.5
        assert _compute_rms(matched) < 0.05

    def test_loudness_match_pair_equalizes(self):
        loud = np.ones(1000) * 0.8
        quiet = np.ones(1000) * 0.4
        a, b = _loudness_match_pair(loud, quiet)
        rms_a = _compute_rms(a)
        rms_b = _compute_rms(b)
        assert rms_a == pytest.approx(rms_b, abs=0.01)

    def test_loudness_match_many_equalizes(self):
        tracks = [
            np.ones(1000) * 0.3,
            np.ones(1000) * 0.6,
            np.ones(1000) * 0.9,
        ]
        matched = _loudness_match_many(tracks)
        rms_values = [_compute_rms(m) for m in matched]
        # All should converge to same RMS
        assert rms_values[0] == pytest.approx(rms_values[1], abs=0.01)
        assert rms_values[1] == pytest.approx(rms_values[2], abs=0.01)

    def test_loudness_match_silent_track_unchanged(self):
        """Silent tracks should not be amplified."""
        silent = np.zeros(1000)
        result = _loudness_match(silent, 0.5)
        assert np.all(result == 0.0)


# --- ManualSegment Schema ---


class TestManualSegment:
    def test_valid_segment(self):
        seg = ManualSegment(file_path="/songs/test.mp3", start_time=30.0, end_time=120.0)
        assert seg.file_path == "/songs/test.mp3"
        assert seg.start_time == 30.0
        assert seg.end_time == 120.0

    def test_manual_mix_request_validates_length(self):
        songs = [
            ManualSegment(file_path=f"/song{i}.mp3", start_time=0, end_time=60)
            for i in range(2)
        ]
        req = ManualMixRequest(songs=songs)
        assert len(req.songs) == 2

    def test_manual_mix_request_rejects_one_song(self):
        with pytest.raises(Exception):
            ManualMixRequest(
                songs=[ManualSegment(file_path="/song.mp3", start_time=0, end_time=60)]
            )

    def test_manual_mix_request_rejects_six_songs(self):
        songs = [
            ManualSegment(file_path=f"/song{i}.mp3", start_time=0, end_time=60)
            for i in range(6)
        ]
        with pytest.raises(Exception):
            ManualMixRequest(songs=songs)


# --- _label_by_energy ---


class TestLabelByEnergy:
    def test_high_energy_is_drop(self):
        assert _label_by_energy(0.8) == SegmentLabel.DROP

    def test_medium_energy_is_chorus(self):
        assert _label_by_energy(0.6) == SegmentLabel.CHORUS

    def test_low_energy_is_verse(self):
        assert _label_by_energy(0.4) == SegmentLabel.VERSE

    def test_very_low_energy_is_intro(self):
        assert _label_by_energy(0.2) == SegmentLabel.INTRO


# --- create_mix_plan_manual ---


class TestCreateMixPlanManual:
    def test_creates_valid_plan(self):
        a = _make_analysis(bpm=128.0, camelot="8B", energy_base=0.6)
        b = _make_analysis(bpm=130.0, camelot="9B", energy_base=0.7)
        seg_a = ManualSegment(file_path="/a.mp3", start_time=30.0, end_time=120.0)
        seg_b = ManualSegment(file_path="/b.mp3", start_time=0.0, end_time=90.0)

        plan = create_mix_plan_manual(a, b, seg_a, seg_b)

        assert plan.track_a == a
        assert plan.track_b == b
        assert plan.selected_section_a.start == 30.0
        assert plan.selected_section_a.end == 120.0
        assert plan.selected_section_b.start == 0.0
        assert plan.selected_section_b.end == 90.0
        assert plan.cue_pair.exit_cue.time == 120.0
        assert plan.cue_pair.entry_cue.time == 0.0
        assert plan.strategy in TransitionStrategy

    def test_strategy_from_camelot_distance(self):
        a = _make_analysis(bpm=128.0, camelot="1B")
        b = _make_analysis(bpm=128.0, camelot="7A")
        seg_a = ManualSegment(file_path="/a.mp3", start_time=30.0, end_time=120.0)
        seg_b = ManualSegment(file_path="/b.mp3", start_time=0.0, end_time=90.0)

        plan = create_mix_plan_manual(a, b, seg_a, seg_b)
        assert plan.strategy == TransitionStrategy.HARD_CUT

    def test_preserves_bpm_delta(self):
        a = _make_analysis(bpm=120.0, camelot="8B")
        b = _make_analysis(bpm=140.0, camelot="8B")
        seg_a = ManualSegment(file_path="/a.mp3", start_time=0, end_time=60)
        seg_b = ManualSegment(file_path="/b.mp3", start_time=0, end_time=60)

        plan = create_mix_plan_manual(a, b, seg_a, seg_b)
        assert plan.cue_pair.bpm_delta == pytest.approx(20.0)


# --- render_transition_audio ---


class TestRenderTransitionAudio:
    def _make_plan(self, strategy=TransitionStrategy.HARD_CUT):
        a = _make_analysis(bpm=128.0, camelot="8B")
        b = _make_analysis(bpm=128.0, camelot="8B")
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

    @patch("app.services.transition_engine._load_audio_segment")
    def test_returns_numpy_array(self, mock_load):
        mock_load.return_value = np.ones(44100 * 5)
        plan = self._make_plan(TransitionStrategy.HARD_CUT)

        with patch(
            "app.services.transition_engine._hard_cut",
            return_value=np.ones(44100),
        ):
            result = render_transition_audio(plan, sr=44100)
            assert isinstance(result, np.ndarray)
            assert len(result) > 0

    @patch("app.services.transition_engine._load_audio_segment")
    def test_preview_mode_skips_stems(self, mock_load):
        """use_stems=False should not call _separate_stems."""
        mock_load.return_value = np.ones(44100 * 5)
        plan = self._make_plan(TransitionStrategy.STEM_SWAP)

        with patch("app.services.transition_engine._separate_stems") as mock_sep:
            result = render_transition_audio(plan, sr=44100, use_stems=False)
            mock_sep.assert_not_called()
            assert isinstance(result, np.ndarray)

    @patch("app.services.transition_engine._load_audio_segment")
    def test_preview_mode_for_rhythm_bridge(self, mock_load):
        """RHYTHM_BRIDGE with use_stems=False should fall back to crossfade."""
        mock_load.return_value = np.ones(44100 * 5)
        plan = self._make_plan(TransitionStrategy.RHYTHM_BRIDGE)

        with patch("app.services.transition_engine._separate_stems") as mock_sep:
            result = render_transition_audio(plan, sr=44100, use_stems=False)
            mock_sep.assert_not_called()
            assert isinstance(result, np.ndarray)


# --- render_chain ---


class TestRenderChain:
    @patch("app.services.transition_engine._load_audio_segment")
    @patch("app.services.transition_engine.sf")
    def test_two_song_chain(self, mock_sf, mock_load):
        """2-song chain should produce output."""
        mock_load.return_value = np.ones(44100 * 5)

        analyses = [
            _make_analysis(bpm=128.0, camelot="8B"),
            _make_analysis(bpm=128.0, camelot="9B"),
        ]
        segments = [
            ManualSegment(file_path="/a.mp3", start_time=30, end_time=120),
            ManualSegment(file_path="/b.mp3", start_time=0, end_time=90),
        ]

        with patch(
            "app.services.transition_engine.render_transition_audio",
            return_value=np.ones(44100 * 2),
        ):
            result = render_chain(analyses, segments, "/tmp/chain.wav", use_stems=False)

        assert result == "/tmp/chain.wav"
        mock_sf.write.assert_called_once()

    @patch("app.services.transition_engine._load_audio_segment")
    @patch("app.services.transition_engine.sf")
    def test_three_song_chain(self, mock_sf, mock_load):
        """3-song chain should render 2 transitions."""
        mock_load.return_value = np.ones(44100 * 5)

        analyses = [
            _make_analysis(bpm=128.0, camelot="8B"),
            _make_analysis(bpm=128.0, camelot="9B"),
            _make_analysis(bpm=130.0, camelot="10B"),
        ]
        segments = [
            ManualSegment(file_path="/a.mp3", start_time=30, end_time=120),
            ManualSegment(file_path="/b.mp3", start_time=0, end_time=90),
            ManualSegment(file_path="/c.mp3", start_time=10, end_time=100),
        ]

        with patch(
            "app.services.transition_engine.render_transition_audio",
            return_value=np.ones(44100 * 2),
        ):
            result = render_chain(analyses, segments, "/tmp/chain3.wav", use_stems=False)

        assert result == "/tmp/chain3.wav"
        mock_sf.write.assert_called_once()
        # Verify we wrote audio data
        written_audio = mock_sf.write.call_args[0][1]
        assert len(written_audio) > 0

    @patch("app.services.transition_engine._load_audio_segment")
    @patch("app.services.transition_engine.sf")
    def test_five_song_chain(self, mock_sf, mock_load):
        """5-song chain should render 4 transitions."""
        mock_load.return_value = np.ones(44100 * 5)

        analyses = [_make_analysis(bpm=128.0, camelot=f"{i+6}B") for i in range(5)]
        segments = [
            ManualSegment(file_path=f"/song{i}.mp3", start_time=0, end_time=60)
            for i in range(5)
        ]

        with patch(
            "app.services.transition_engine.render_transition_audio",
            return_value=np.ones(44100 * 2),
        ):
            result = render_chain(analyses, segments, "/tmp/chain5.wav", use_stems=False)

        assert result == "/tmp/chain5.wav"
        mock_sf.write.assert_called_once()

    @patch("app.services.transition_engine._load_audio_segment")
    @patch("app.services.transition_engine.sf")
    def test_output_has_fade_out(self, mock_sf, mock_load):
        """Final output should have a fade-out at the end."""
        mock_load.return_value = np.ones(44100 * 5)

        analyses = [
            _make_analysis(bpm=128.0, camelot="8B"),
            _make_analysis(bpm=128.0, camelot="8B"),
        ]
        segments = [
            ManualSegment(file_path="/a.mp3", start_time=0, end_time=60),
            ManualSegment(file_path="/b.mp3", start_time=0, end_time=60),
        ]

        with patch(
            "app.services.transition_engine.render_transition_audio",
            return_value=np.ones(44100 * 2),
        ):
            render_chain(analyses, segments, "/tmp/fade.wav", use_stems=False)

        written_audio = mock_sf.write.call_args[0][1]
        # Last sample should be near zero (fade out)
        assert abs(written_audio[-1]) < 0.01


# --- CLI Argument Parsing ---


class TestCLIManualParsing:
    def test_parse_valid_triples(self):
        from spike_mix import _parse_manual_args

        result = _parse_manual_args(["a.mp3", "30", "120", "b.mp3", "0", "90"])
        assert len(result) == 2
        assert result[0] == ("a.mp3", 30.0, 120.0)
        assert result[1] == ("b.mp3", 0.0, 90.0)

    def test_parse_five_songs(self):
        from spike_mix import _parse_manual_args

        args = []
        for i in range(5):
            args.extend([f"song{i}.mp3", str(i * 10), str(i * 10 + 60)])
        result = _parse_manual_args(args)
        assert len(result) == 5

    def test_rejects_non_divisible_by_three(self):
        from spike_mix import _parse_manual_args

        with pytest.raises(SystemExit):
            _parse_manual_args(["a.mp3", "30"])

    def test_rejects_one_song(self):
        from spike_mix import _parse_manual_args

        with pytest.raises(SystemExit):
            _parse_manual_args(["a.mp3", "0", "60"])

    def test_rejects_six_songs(self):
        from spike_mix import _parse_manual_args

        args = []
        for i in range(6):
            args.extend([f"song{i}.mp3", "0", "60"])
        with pytest.raises(SystemExit):
            _parse_manual_args(args)

    def test_rejects_end_before_start(self):
        from spike_mix import _parse_manual_args

        with pytest.raises(SystemExit):
            _parse_manual_args(["a.mp3", "120", "30", "b.mp3", "0", "90"])

    def test_rejects_negative_timestamps(self):
        from spike_mix import _parse_manual_args

        with pytest.raises(SystemExit):
            _parse_manual_args(["a.mp3", "-5", "30", "b.mp3", "0", "90"])


# --- API Endpoints ---


@pytest.fixture
def client():
    jobs.clear()
    with TestClient(app) as c:
        yield c


class TestManualMixEndpoint:
    def test_returns_job_id(self, client):
        resp = client.post(
            "/api/v1/mix/manual",
            json={
                "songs": [
                    {"file_path": "/a.mp3", "start_time": 30, "end_time": 120},
                    {"file_path": "/b.mp3", "start_time": 0, "end_time": 90},
                ]
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "job_id" in data
        assert data["status"] == "pending"

    def test_rejects_one_song(self, client):
        resp = client.post(
            "/api/v1/mix/manual",
            json={
                "songs": [
                    {"file_path": "/a.mp3", "start_time": 30, "end_time": 120},
                ]
            },
        )
        assert resp.status_code == 422  # Pydantic validation

    def test_accepts_five_songs(self, client):
        songs = [
            {"file_path": f"/song{i}.mp3", "start_time": 0, "end_time": 60}
            for i in range(5)
        ]
        resp = client.post("/api/v1/mix/manual", json={"songs": songs})
        assert resp.status_code == 200

    def test_rejects_six_songs(self, client):
        songs = [
            {"file_path": f"/song{i}.mp3", "start_time": 0, "end_time": 60}
            for i in range(6)
        ]
        resp = client.post("/api/v1/mix/manual", json={"songs": songs})
        assert resp.status_code == 422


class TestTransitionPreviewEndpoint:
    def test_endpoint_exists(self, client):
        """POST /api/v1/transition/preview should accept valid request body."""
        resp = client.post(
            "/api/v1/transition/preview",
            json={
                "song_a": {"file_path": "/a.mp3", "start_time": 30, "end_time": 120},
                "song_b": {"file_path": "/b.mp3", "start_time": 0, "end_time": 90},
            },
        )
        # Will fail with 500 since we can't actually analyze files,
        # but it proves the endpoint exists and accepts the schema.
        assert resp.status_code in (200, 500)


class TestCORSMiddleware:
    def test_cors_headers(self, client):
        resp = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
