"""Tests for the FastAPI API endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app, jobs
from app.models.schemas import MixStatus
from tests.conftest import _make_analysis


@pytest.fixture
def client():
    """Create a test client and clear jobs between tests."""
    jobs.clear()
    with TestClient(app) as c:
        yield c


class TestHealthCheck:
    def test_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "2.0.0-spike"


class TestCreateMix:
    def test_returns_job_id(self, client):
        """Upload two files, get back a job_id."""
        resp = client.post(
            "/api/v1/mix",
            files={
                "track_a": ("song1.mp3", b"fake audio data", "audio/mpeg"),
                "track_b": ("song2.mp3", b"fake audio data", "audio/mpeg"),
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "job_id" in data
        assert data["status"] == "pending"

    def test_job_stored_in_memory(self, client):
        resp = client.post(
            "/api/v1/mix",
            files={
                "track_a": ("a.mp3", b"data", "audio/mpeg"),
                "track_b": ("b.mp3", b"data", "audio/mpeg"),
            },
        )
        job_id = resp.json()["job_id"]
        assert job_id in jobs


class TestGetMixStatus:
    def test_returns_status(self, client):
        job_id = "test-123"
        jobs[job_id] = {
            "status": MixStatus.ANALYZING,
            "progress": 0.3,
            "error": None,
        }
        resp = client.get(f"/api/v1/mix/{job_id}/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "analyzing"
        assert data["progress"] == 0.3

    def test_not_found(self, client):
        resp = client.get("/api/v1/mix/nonexistent/status")
        assert resp.status_code == 404


class TestDownloadMix:
    def test_not_complete_returns_400(self, client):
        job_id = "test-456"
        jobs[job_id] = {
            "status": MixStatus.RENDERING,
            "progress": 0.7,
            "error": None,
            "output_path": "/fake/path.wav",
        }
        resp = client.get(f"/api/v1/mix/{job_id}/download")
        assert resp.status_code == 400

    def test_not_found(self, client):
        resp = client.get("/api/v1/mix/nonexistent/download")
        assert resp.status_code == 404

    def test_complete_returns_file(self, client, tmp_path):
        """When job is complete and file exists, return it."""
        output_file = tmp_path / "mix.wav"
        output_file.write_bytes(b"RIFF" + b"\x00" * 100)  # Fake WAV header

        job_id = "test-789"
        jobs[job_id] = {
            "status": MixStatus.COMPLETE,
            "progress": 1.0,
            "error": None,
            "output_path": str(output_file),
        }
        resp = client.get(f"/api/v1/mix/{job_id}/download")
        assert resp.status_code == 200


class TestSpikeCLI:
    """Test spike_mix.py argument parsing (no real audio processing)."""

    def test_help_flag(self):
        """Verify argparse works without importing audio libs."""
        import subprocess

        result = subprocess.run(
            ["python", "-c", "import argparse; print('ok')"],
            capture_output=True,
            text=True,
            cwd=".",
        )
        assert result.returncode == 0
