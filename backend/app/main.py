"""Personal DJ v2 - FastAPI application."""

from fastapi import FastAPI

from app.models.schemas import HealthResponse

app = FastAPI(
    title="Personal DJ",
    description="AI-powered DJ transition engine",
    version="2.0.0-spike",
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse()
