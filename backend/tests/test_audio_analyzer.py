"""Tests for the audio analyzer service.

All external libraries (librosa, essentia) are mocked.
No real audio files are needed.
"""

import sys
import pytest
import numpy as np
from unittest.mock import patch, MagicMock

# Mock external modules before importing audio_analyzer so its top-level
# imports of librosa, essentia.standard succeed without the real packages.
sys.modules.setdefault("librosa", MagicMock())
sys.modules.setdefault("librosa.feature", MagicMock())
sys.modules.setdefault("librosa.onset", MagicMock())
sys.modules.setdefault("librosa.segment", MagicMock())
sys.modules.setdefault("essentia", MagicMock())
sys.modules.setdefault("essentia.standard", MagicMock())

from app.models.schemas import KeyInfo, Segment, SegmentLabel, TrackAnalysis
from app.services.audio_analyzer import (
    analyze_track,
    _detect_key,
    _compute_energy,
    _get_segments,
    _get_rhythm,
    _label_segment,
)


# --- _detect_key ---


class TestDetectKey:
    @patch("app.services.audio_analyzer.es")
    def test_detect_key_c_major(self, mock_es):
        mock_loader_instance = MagicMock()
        mock_loader_instance.return_value = np.zeros(44100)
        mock_es.MonoLoader.return_value = mock_loader_instance

        mock_extractor_instance = MagicMock()
        mock_extractor_instance.return_value = ("C", "major", 0.8)
        mock_es.KeyExtractor.return_value = mock_extractor_instance

        result = _detect_key("/fake/track.mp3")

        assert result.key == "C"
        assert result.scale == "major"
        assert result.camelot == "8B"

    @patch("app.services.audio_analyzer.es")
    def test_detect_key_unknown_falls_back(self, mock_es):
        mock_loader_instance = MagicMock()
        mock_loader_instance.return_value = np.zeros(44100)
        mock_es.MonoLoader.return_value = mock_loader_instance

        mock_extractor_instance = MagicMock()
        mock_extractor_instance.return_value = ("X#", "dorian", 0.5)
        mock_es.KeyExtractor.return_value = mock_extractor_instance

        result = _detect_key("/fake/track.mp3")

        assert result.camelot == "1A"

    @patch("app.services.audio_analyzer.es")
    def test_detect_key_minor(self, mock_es):
        mock_loader_instance = MagicMock()
        mock_loader_instance.return_value = np.zeros(44100)
        mock_es.MonoLoader.return_value = mock_loader_instance

        mock_extractor_instance = MagicMock()
        mock_extractor_instance.return_value = ("A", "minor", 0.9)
        mock_es.KeyExtractor.return_value = mock_extractor_instance

        result = _detect_key("/fake/track.mp3")

        assert result.key == "A"
        assert result.scale == "minor"
        assert result.camelot == "8A"


# --- _compute_energy ---


class TestComputeEnergy:
    @patch("app.services.audio_analyzer.librosa")
    def test_energy_shape(self, mock_librosa):
        n_frames = 10
        mock_librosa.feature.rms.return_value = np.random.rand(1, n_frames)
        mock_librosa.feature.spectral_centroid.return_value = np.random.rand(
            1, n_frames
        )
        mock_librosa.onset.onset_strength.return_value = np.random.rand(n_frames)

        y = np.random.rand(22050)
        result = _compute_energy(y, sr=22050)

        assert len(result) == n_frames

    @patch("app.services.audio_analyzer.librosa")
    def test_energy_values_in_range(self, mock_librosa):
        n_frames = 20
        mock_librosa.feature.rms.return_value = np.random.rand(1, n_frames) + 0.01
        mock_librosa.feature.spectral_centroid.return_value = (
            np.random.rand(1, n_frames) + 0.01
        )
        mock_librosa.onset.onset_strength.return_value = (
            np.random.rand(n_frames) + 0.01
        )

        y = np.random.rand(44100)
        result = _compute_energy(y, sr=44100)

        for val in result:
            assert 0.0 <= val <= 1.0, f"Energy value {val} out of [0, 1] range"

    @patch("app.services.audio_analyzer.librosa")
    def test_energy_weights(self, mock_librosa):
        """Verify the 0.5/0.3/0.2 weighting with known inputs."""
        rms_raw = np.array([[1.0, 0.5, 0.0, 0.25, 0.75]])
        cent_raw = np.array([[1.0, 0.5, 0.0, 0.25, 0.75]])
        onset_raw = np.array([1.0, 0.5, 0.0, 0.25, 0.75])

        mock_librosa.feature.rms.return_value = rms_raw
        mock_librosa.feature.spectral_centroid.return_value = cent_raw
        mock_librosa.onset.onset_strength.return_value = onset_raw

        y = np.random.rand(22050)
        result = _compute_energy(y, sr=22050)

        assert result[0] == pytest.approx(1.0, abs=1e-6)
        assert result[1] == pytest.approx(0.5, abs=1e-6)
        assert result[2] == pytest.approx(0.0, abs=1e-6)


# --- _get_rhythm ---


class TestGetRhythm:
    @patch("app.services.audio_analyzer.es")
    def test_extracts_bpm_beats_downbeats(self, mock_es):
        mock_loader = MagicMock()
        mock_loader.return_value = np.zeros(44100 * 60)
        mock_es.MonoLoader.return_value = mock_loader

        mock_rhythm = MagicMock()
        beats = np.array([0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5])
        mock_rhythm.return_value = (128.0, beats, np.ones(8), None, np.ones(7) * 0.5)
        mock_es.RhythmExtractor2013.return_value = mock_rhythm

        bpm, beat_list, downbeat_list = _get_rhythm("/fake/track.mp3")

        assert bpm == 128.0
        assert len(beat_list) == 8
        assert beat_list[0] == 0.0
        # Downbeats are every 4th beat
        assert len(downbeat_list) == 2
        assert downbeat_list[0] == 0.0
        assert downbeat_list[1] == 2.0


# --- _label_segment ---


class TestLabelSegment:
    # Use sr=1, hop_length=1 so fps=1 (1 frame per second).
    # Energy arrays sized to match track duration (240 frames = 240 seconds).

    def test_intro_at_start_low_energy(self):
        """First segment with below-average energy -> INTRO."""
        # Intro (0-30s) at 0.2, rest at 0.6. Global mean ~0.55. Seg < 0.55*0.9=0.495.
        energy = [0.2] * 30 + [0.6] * 210
        label = _label_segment(0.0, 30.0, 240.0, energy, sr=1, hop_length=1)
        assert label == SegmentLabel.INTRO

    def test_outro_at_end_low_energy(self):
        """Last segment with below-average energy -> OUTRO."""
        # Body at 0.6, outro (230-240s) at 0.2. Global mean ~0.58. Seg < 0.58*0.9=0.52.
        energy = [0.6] * 230 + [0.2] * 10
        label = _label_segment(230.0, 240.0, 240.0, energy, sr=1, hop_length=1)
        assert label == SegmentLabel.OUTRO

    def test_high_energy_is_chorus(self):
        """High energy mid-track segment -> CHORUS."""
        # Low at 0.3, chorus (90-150s) at 0.9. Global mean ~0.45. Seg 0.9 > 0.45*1.3=0.585.
        energy = [0.3] * 90 + [0.9] * 60 + [0.3] * 90
        label = _label_segment(90.0, 150.0, 240.0, energy, sr=1, hop_length=1)
        assert label == SegmentLabel.CHORUS

    def test_low_energy_mid_track_is_bridge(self):
        """Low energy mid-track segment -> BRIDGE."""
        # Body at 0.7, bridge (100-130s) at 0.1. Global mean ~0.625. Seg 0.1 < 0.625*0.7=0.4375.
        energy = [0.7] * 100 + [0.1] * 30 + [0.7] * 110
        label = _label_segment(100.0, 130.0, 240.0, energy, sr=1, hop_length=1)
        assert label == SegmentLabel.BRIDGE


# --- _get_segments ---


class TestGetSegments:
    @patch("app.services.audio_analyzer.librosa")
    def test_returns_segments_from_boundaries(self, mock_librosa):
        """Laplacian segmentation boundaries produce correct segment count."""
        y = np.random.rand(44100 * 120)  # 120 seconds
        sr = 44100
        energy = [0.5] * 200

        boundary_frames = np.array([100, 300, 500, 700, 900])
        mock_librosa.segment.agglomerative.return_value = boundary_frames
        mock_librosa.feature.chroma_cqt.return_value = np.random.rand(12, 1000)
        mock_librosa.segment.recurrence_matrix.return_value = np.eye(1000)
        mock_librosa.frames_to_time.return_value = np.array(
            [23.2, 69.7, 116.3, 162.8, 209.3]
        )

        segments = _get_segments(y, sr, energy, n_segments=6)

        # 5 boundaries -> 6 segments
        assert len(segments) == 6
        assert segments[0].start == 0.0
        assert segments[-1].end == pytest.approx(120.0, abs=0.1)
        assert all(isinstance(s, Segment) for s in segments)

    @patch("app.services.audio_analyzer.librosa")
    def test_segments_cover_full_duration(self, mock_librosa):
        """Segments should be contiguous from 0 to duration."""
        y = np.random.rand(44100 * 60)
        sr = 44100
        energy = [0.5] * 100

        mock_librosa.segment.agglomerative.return_value = np.array([200, 400])
        mock_librosa.feature.chroma_cqt.return_value = np.random.rand(12, 600)
        mock_librosa.segment.recurrence_matrix.return_value = np.eye(600)
        mock_librosa.frames_to_time.return_value = np.array([20.0, 40.0])

        segments = _get_segments(y, sr, energy, n_segments=3)

        assert segments[0].start == 0.0
        for i in range(1, len(segments)):
            assert segments[i].start == segments[i - 1].end


# --- analyze_track (integration) ---


class TestAnalyzeTrack:
    @patch("app.services.audio_analyzer._get_segments")
    @patch("app.services.audio_analyzer._compute_energy")
    @patch("app.services.audio_analyzer._get_rhythm")
    @patch("app.services.audio_analyzer._detect_key")
    @patch("app.services.audio_analyzer.librosa")
    def test_full_pipeline(
        self, mock_librosa, mock_detect_key, mock_get_rhythm,
        mock_compute_energy, mock_get_segments,
    ):
        sr = 44100
        duration_samples = sr * 120
        mock_librosa.load.return_value = (np.zeros(duration_samples), sr)

        mock_detect_key.return_value = KeyInfo(key="C", scale="major", camelot="8B")
        mock_get_rhythm.return_value = (128.0, [0.0, 0.5, 1.0, 1.5], [0.0, 1.0])
        mock_compute_energy.return_value = [0.5] * 100
        mock_get_segments.return_value = [
            Segment(label=SegmentLabel.INTRO, start=0.0, end=30.0),
            Segment(label=SegmentLabel.CHORUS, start=30.0, end=90.0),
        ]

        result = analyze_track("/fake/song.mp3")

        assert isinstance(result, TrackAnalysis)
        assert result.bpm == 128.0
        assert result.key.camelot == "8B"
        assert len(result.segments) == 2
        assert result.beats == [0.0, 0.5, 1.0, 1.5]
        assert result.downbeats == [0.0, 1.0]
        assert result.energy_curve == [0.5] * 100
        assert result.sample_rate == sr
        assert result.duration == pytest.approx(120.0, abs=0.01)

    @patch("app.services.audio_analyzer._get_segments")
    @patch("app.services.audio_analyzer._compute_energy")
    @patch("app.services.audio_analyzer._get_rhythm")
    @patch("app.services.audio_analyzer._detect_key")
    @patch("app.services.audio_analyzer.librosa")
    def test_file_path_preserved(
        self, mock_librosa, mock_detect_key, mock_get_rhythm,
        mock_compute_energy, mock_get_segments,
    ):
        sr = 44100
        mock_librosa.load.return_value = (np.zeros(sr * 60), sr)
        mock_detect_key.return_value = KeyInfo(key="G", scale="major", camelot="9B")
        mock_get_rhythm.return_value = (140.0, [], [])
        mock_compute_energy.return_value = [0.3] * 50
        mock_get_segments.return_value = []

        input_path = "/my/specific/file.wav"
        result = analyze_track(input_path)

        assert result.file_path == input_path
