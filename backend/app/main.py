from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import forecast, history, optimization, risk, simulation, wells

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0",
              description="Hackathon integration API. Stage 1 physics is explicitly uncalibrated.")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(wells.router)
app.include_router(simulation.router)
app.include_router(optimization.router)
app.include_router(forecast.router)
app.include_router(risk.router)
app.include_router(history.router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
