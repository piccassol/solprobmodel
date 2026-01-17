# main.py

from fastapi import FastAPI
from api.routes.whale_flows import router as whale_flows_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="MobyAI Backend",
    description="Backend API for MobyAI Whale Flow Integration",
    version="1.0.0",
)

# Routes
app.include_router(whale_flows_router)

# Health checks
@app.get("/healthz")
async def health():
    return {"status": "ok"}

@app.get("/readyz")
async def ready():
    return {"status": "ready", "provider": settings.WHALE_PROVIDER}
