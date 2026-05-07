# modified by agent: add ollama settings routes
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Make app.* loggers surface at INFO so WS lifecycle events are visible.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

from app.api.credentials import router as credentials_router
from app.api.folders import router as folders_router
from app.api.models import router as models_router
from app.api.sessions import router as sessions_router
from app.db import init_db
from app.ws.session_ws import router as ws_router
from app.store.credentials import get_ollama_base_url, set_ollama_base_url


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan, title="Forge")

app.include_router(credentials_router)
app.include_router(sessions_router)
app.include_router(folders_router)
app.include_router(models_router)
app.include_router(ws_router)


@app.get("/api/hello")
async def hello() -> dict:
    return {"message": "Hello from the Forge backend"}


@app.get("/api/settings/ollama")
async def get_ollama_settings() -> dict:
    return {"base_url": get_ollama_base_url()}


@app.post("/api/settings/ollama")
async def post_ollama_settings(body: dict) -> dict:
    base_url = body.get("base_url")
    if not isinstance(base_url, str) or not base_url.strip() or not (base_url.startswith("http://") or base_url.startswith("https://")):
        return JSONResponse(status_code=422, content={"error": "Invalid URL. Must start with http:// or https://"})
    set_ollama_base_url(base_url.strip())
    return {"ok": True}


# Serve the built frontend bundle from app/static/ when present. The directory
# is created by scripts/build-wheel.sh before packaging; in local dev it won't
# exist and we skip mounting — use `npm run dev` for the frontend instead.
STATIC_DIR = Path(__file__).parent / "static"

if STATIC_DIR.is_dir() and (STATIC_DIR / "index.html").is_file():
    app.mount(
        "/assets",
        StaticFiles(directory=STATIC_DIR / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith(("api/", "ws/")):
            raise HTTPException(status_code=404)
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
