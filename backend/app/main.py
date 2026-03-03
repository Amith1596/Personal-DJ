"""Personal DJ v2 - FastAPI application."""

import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

from app.models.schemas import (
    HealthResponse,
    MixStatus,
    MixStatusResponse,
)

# In-memory job store (replace with DB in production)
jobs: dict[str, dict] = {}

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")


@asynccontextmanager
async def lifespan(app: FastAPI):
    UPLOAD_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)
    yield


app = FastAPI(
    title="Personal DJ",
    description="AI-powered DJ transition engine",
    version="2.0.0-spike",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse()


@app.post("/api/v1/mix", response_model=MixStatusResponse)
async def create_mix(
    background_tasks: BackgroundTasks,
    track_a: UploadFile = File(...),
    track_b: UploadFile = File(...),
):
    """Upload 2 tracks and start mix processing."""
    job_id = str(uuid.uuid4())

    # Save uploaded files
    path_a = UPLOAD_DIR / f"{job_id}_a_{track_a.filename}"
    path_b = UPLOAD_DIR / f"{job_id}_b_{track_b.filename}"

    path_a.write_bytes(await track_a.read())
    path_b.write_bytes(await track_b.read())

    output_path = OUTPUT_DIR / f"{job_id}_mix.wav"

    jobs[job_id] = {
        "status": MixStatus.PENDING,
        "progress": 0.0,
        "error": None,
        "track_a": str(path_a),
        "track_b": str(path_b),
        "output_path": str(output_path),
    }

    background_tasks.add_task(_process_mix, job_id)

    return MixStatusResponse(job_id=job_id, status=MixStatus.PENDING, progress=0.0)


async def _process_mix(job_id: str):
    """Background task that runs the full DJ pipeline."""
    job = jobs[job_id]
    try:
        # Import here to avoid circular imports and allow mocking
        from app.services.audio_analyzer import analyze_track
        from app.services.transition_engine import render_transition
        from app.services.mix_planner import create_mix_plan

        # Step 1: Analyze
        job["status"] = MixStatus.ANALYZING
        job["progress"] = 0.1
        analysis_a = analyze_track(job["track_a"])
        job["progress"] = 0.3
        analysis_b = analyze_track(job["track_b"])
        job["progress"] = 0.5

        # Step 2: Plan
        job["status"] = MixStatus.PLANNING
        job["progress"] = 0.6
        mix_plan = create_mix_plan(analysis_a, analysis_b)

        # Step 3: Render
        job["status"] = MixStatus.RENDERING
        job["progress"] = 0.7
        render_transition(mix_plan, job["output_path"])

        job["status"] = MixStatus.COMPLETE
        job["progress"] = 1.0

    except Exception as e:
        job["status"] = MixStatus.FAILED
        job["error"] = str(e)


@app.get("/api/v1/mix/{job_id}/status", response_model=MixStatusResponse)
async def get_mix_status(job_id: str):
    """Poll job status."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    return MixStatusResponse(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        error=job["error"],
    )


@app.get("/api/v1/mix/{job_id}/download")
async def download_mix(job_id: str):
    """Download the completed mix."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    if job["status"] != MixStatus.COMPLETE:
        raise HTTPException(
            status_code=400,
            detail=f"Job not complete. Status: {job['status']}",
        )
    output_path = Path(job["output_path"])
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Output file not found")
    return FileResponse(
        path=str(output_path),
        media_type="audio/wav",
        filename=output_path.name,
    )
