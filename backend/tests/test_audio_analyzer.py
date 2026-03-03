"""Tests for the audio analyzer service.

All external libraries (allin1, librosa, essentia) are mocked.
No real audio files are needed.
"""

import sys
import pytest
import numpy as np
from unittest.mock import patch, MagicMock

# Mock external modules before importing audio_analyzer so its top-level
# imports of allin1, librosa, essentia.standard succeed without the real packages.
sys.modules.setdefault("allin1", MagicMock())
sys.modules.setdefault("librosa", MagicMock())
sys.modules.setdefault("librosa.feature", MagicMock())
sys.modules.setdefault("librosa.onset", MagicMock())
sys.modules.setdefault("essentia", MagicMock())
sys.modules.setdefault("essentia.standard", MagicMock())

from app.models.schemas import KeyInfo, Segment, SegmentLabel, TrackAnalysis
from app.services.audio_analyzer import (
    analyze_track,
    _detect_key,
    _compute_energy,
    _get_segments,
    _get_beats,
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
        n_frames = 5

        # All ones after normalization: rms=1, cent=1, onset=1
        # So composite should be 0.5*1 + 0.3*1 + 0.2*1 = 1.0 for the max frame
        rms_raw = np.array([[1.0, 0.5, 0.0, 0.25, 0.75]])
        cent_raw = np.array([[1.0, 0.5, 0.0, 0.25, 0.75]])
        onset_raw = np.array([1.0, 0.5, 0.0, 0.25, 0.75])

        mock_librosa.feature.rms.return_value = rms_raw
        mock_librosa.feature.spectral_centroid.return_value = cent_raw
        mock_librosa.onset.onset_strength.return_value = onset_raw

        y = np.random.rand(22050)
        result = _compute_energy(y, sr=22050)

        # When all three are at max (1.0), normalized = 1.0 each
        # composite = 0.5*1 + 0.3*1 + 0.2*1 = 1.0
        assert result[0] == pytest.approx(1.0, abs=1e-6)

        # When all are at 0.5/max(1.0)=0.5
        # composite = 0.5*0.5 + 0.3*0.5 + 0.2*0.5 = 0.5
        assert result[1] == pytest.approx(0.5, abs=1e-6)

        # When all are 0 (after normalization 0/1 = 0)
        # composite = 0.5*0 + 0.3*0 + 0.2*0 = 0.0
        assert result[2] == pytest.approx(0.0, abs=1e-6)


# --- _get_segments ---


class TestGetSegments:
    def test_converts_allin1_segments(self):
        mock_result = MagicMock()
        seg1 = MagicMock()
        seg1.label = "intro"
        seg1.start = 0.0
        seg1.end = 30.0

        seg2 = MagicMock()
        seg2.label = "chorus"
        seg2.start = 30.0
        seg2.end = 90.0

        seg3 = MagicMock()
        seg3.label = "outro"
        seg3.start = 90.0
        seg3.end = 120.0

        mock_result.segments = [seg1, seg2, seg3]

        segments = _get_segments(mock_result)

        assert len(segments) == 3
        assert segments[0].label == SegmentLabel.INTRO
        assert segments[1].label == SegmentLabel.CHORUS
        assert segments[2].label == SegmentLabel.OUTRO
        assert segments[0].start == 0.0
        assert segments[1].end == 90.0

    def test_unknown_label_maps_to_bridge(self):
        mock_result = MagicMock()
        seg = MagicMock()
        seg.label = "breakdown"
        seg.start = 60.0
        seg.end = 90.0
        mock_result.segments = [seg]

        segments = _get_segments(mock_result)

        assert len(segments) == 1
        assert segments[0].label == SegmentLabel.BRIDGE


# --- _get_beats ---


class TestGetBeats:
    def test_extracts_beats_and_downbeats(self):
        mock_result = MagicMock()
        mock_result.beats = [0.0, 0.5, 1.0]
        mock_result.downbeats = [0.0, 1.0]

        beats, downbeats = _get_beats(mock_result)

        assert beats == [0.0, 0.5, 1.0]
        assert downbeats == [0.0, 1.0]


# --- analyze_track (integration with all mocks) ---


class TestAnalyzeTrack:
    @patch("app.services.audio_analyzer._compute_energy")
    @patch("app.services.audio_analyzer._detect_key")
    @patch("app.services.audio_analyzer.librosa")
    @patch("app.services.audio_analyzer.allin1")
    def test_full_pipeline(
        self, mock_allin1, mock_librosa, mock_detect_key, mock_compute_energy
    ):
        # Set up allin1 mock result
        mock_result = MagicMock()
        mock_result.bpm = 128.0

        seg1 = MagicMock()
        seg1.label = "intro"
        seg1.start = 0.0
        seg1.end = 30.0
        seg2 = MagicMock()
        seg2.label = "chorus"
        seg2.start = 30.0
        seg2.end = 90.0
        mock_result.segments = [seg1, seg2]
        mock_result.beats = [0.0, 0.5, 1.0, 1.5]
        mock_result.downbeats = [0.0, 1.0]

        mock_allin1.analyze.return_value = mock_result

        # Set up librosa.load mock
        sr = 22050
        duration_samples = sr * 120  # 120 seconds
        mock_librosa.load.return_value = (np.zeros(duration_samples), sr)

        # Set up key detection mock
        mock_detect_key.return_value = KeyInfo(key="C", scale="major", camelot="8B")

        # Set up energy mock
        mock_compute_energy.return_value = [0.5] * 100

        result = analyze_track("/fake/song.mp3")

        assert isinstance(result, TrackAnalysis)
        assert result.bpm == 128.0
        assert result.key.camelot == "8B"
        assert len(result.segments) == 2
        assert result.segments[0].label == SegmentLabel.INTRO
        assert result.segments[1].label == SegmentLabel.CHORUS
        assert result.beats == [0.0, 0.5, 1.0, 1.5]
        assert result.downbeats == [0.0, 1.0]
        assert result.energy_curve == [0.5] * 100
        assert result.sample_rate == sr
        assert result.duration == pytest.approx(120.0, abs=0.01)

    @patch("app.services.audio_analyzer._compute_energy")
    @patch("app.services.audio_analyzer._detect_key")
    @patch("app.services.audio_analyzer.librosa")
    @patch("app.services.audio_analyzer.allin1")
    def test_file_path_preserved(
        self, mock_allin1, mock_librosa, mock_detect_key, mock_compute_energy
    ):
        mock_result = MagicMock()
        mock_result.bpm = 140.0
        mock_result.segments = []
        mock_result.beats = []
        mock_result.downbeats = []
        mock_allin1.analyze.return_value = mock_result

        sr = 44100
        mock_librosa.load.return_value = (np.zeros(sr * 60), sr)
        mock_detect_key.return_value = KeyInfo(key="G", scale="major", camelot="9B")
        mock_compute_energy.return_value = [0.3] * 50

        input_path = "/my/specific/file.wav"
        result = analyze_track(input_path)

        assert result.file_path == input_path
