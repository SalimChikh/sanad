from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.media import UPLOAD_DIR
from app.routers import auth, calendar, children, classrooms, feed, health, staff, uploads

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "").strip()
    if not configured:
        return DEFAULT_CORS_ORIGINS
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    return origins or DEFAULT_CORS_ORIGINS


app = FastAPI(title="Sanad API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router_module in (health, auth, staff, classrooms, children, feed, calendar, uploads):
    app.include_router(router_module.router)

# Serves whatever upload_photo() (routers/uploads.py) wrote to disk back out
# at the same /uploads/<file> path it returned — see app/media.py for why
# this is local disk rather than real object storage.
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
