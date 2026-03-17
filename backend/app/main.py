"""Personal DJ v2 - FastAPI application."""

import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.models.schemas import (
    HealthResponse,
    ManualMixRequest,
    ManualSegment,
    MixStatus,
    MixStatusResponse,
    TransitionPreviewRequest,
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse()


# --- File Upload ---


@app.post("/api/v1/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload an audio file. Returns the server-side path for use in manual mix."""
    file_id = str(uuid.uuid4())[:8]
    filename = f"{file_id}_{file.filename}"
    path = UPLOAD_DIR / filename
    path.write_bytes(await file.read())
    return {"path": str(path), "filename": file.filename}


# --- Auto Mode (existing) ---


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


# --- Manual Mode ---


@app.post("/api/v1/mix/manual", response_model=MixStatusResponse)
async def create_manual_mix(
    background_tasks: BackgroundTasks,
    request: ManualMixRequest,
):
    """Start a manual chain mix with user-provided timestamps."""
    job_id = str(uuid.uuid4())
    output_path = OUTPUT_DIR / f"{job_id}_manual_mix.wav"

    jobs[job_id] = {
        "status": MixStatus.PENDING,
        "progress": 0.0,
        "error": None,
        "songs": [s.model_dump() for s in request.songs],
        "output_path": str(output_path),
    }

    background_tasks.add_task(_process_manual_mix, job_id)

    return MixStatusResponse(job_id=job_id, status=MixStatus.PENDING, progress=0.0)


async def _process_manual_mix(job_id: str):
    """Background task for manual chain mix."""
    job = jobs[job_id]
    try:
        from app.services.audio_analyzer import analyze_track
        from app.services.transition_engine import render_chain

        songs = [ManualSegment(**s) for s in job["songs"]]
        n = len(songs)

        # Step 1: Analyze all songs
        job["status"] = MixStatus.ANALYZING
        analyses = []
        for i, seg in enumerate(songs):
            analyses.append(analyze_track(seg.file_path))
            job["progress"] = (i + 1) / n * 0.5

        # Step 2: Render chain
        job["status"] = MixStatus.RENDERING
        job["progress"] = 0.6
        render_chain(analyses, songs, job["output_path"])

        job["status"] = MixStatus.COMPLETE
        job["progress"] = 1.0

    except Exception as e:
        job["status"] = MixStatus.FAILED
        job["error"] = str(e)


@app.post("/api/v1/transition/preview")
async def preview_transition(request: TransitionPreviewRequest):
    """Render a single transition preview between two songs.

    Returns the rendered transition audio as a WAV file.
    Uses simple crossfade (no Demucs) for speed.
    """
    import tempfile

    try:
        from app.services.audio_analyzer import analyze_track
        from app.services.mix_planner import create_mix_plan_manual
        from app.services.transition_engine import render_transition_audio

        import numpy as np
        import soundfile as sf_lib

        # Analyze both songs
        analysis_a = analyze_track(request.song_a.file_path)
        analysis_b = analyze_track(request.song_b.file_path)

        # Plan the transition
        plan = create_mix_plan_manual(
            analysis_a, analysis_b, request.song_a, request.song_b
        )

        # Render transition audio (no stems for speed)
        transition_audio = render_transition_audio(plan, sr=44100, use_stems=False)

        # Normalize
        peak = np.max(np.abs(transition_audio))
        if peak > 0:
            transition_audio = transition_audio / peak

        # Write to temp file and return
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            sf_lib.write(tmp.name, transition_audio, 44100)
            return FileResponse(
                path=tmp.name,
                media_type="audio/wav",
                filename="preview.wav",
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
