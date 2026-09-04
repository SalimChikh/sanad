"""Photo storage — Supabase Storage when configured, local disk otherwise.

Same fallback shape as app/database.py: a real backing service is used once
its credentials are present in the environment, and local dev/tests keep
working with zero external setup otherwise. See the README's "Déployé"
section — Render now has SUPABASE_URL/SUPABASE_SERVICE_KEY set, so
production uploads land in the `photos` bucket (public, created directly
via `insert into storage.buckets`) instead of the backend's own ephemeral
disk, which doesn't survive a Render redeploy or cold restart.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import httpx

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Extension is trusted from content-type, not from the client-supplied
# filename — keeps stored filenames predictable and avoids path tricks.
ALLOWED_CONTENT_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
STORAGE_BUCKET = "photos"


def storage_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def save_upload(data: bytes, content_type: str) -> str:
    """Persist an already-validated image and return a URL/path an <img>
    tag can load — absolute (Supabase Storage's public URL) once storage is
    configured, or a relative `/uploads/...` path (resolved against the
    API's own origin by the frontend's `mediaUrl()`) otherwise."""
    extension = ALLOWED_CONTENT_TYPES[content_type]
    name = f"{uuid.uuid4()}{extension}"
    if storage_enabled():
        url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{name}"
        headers = {
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": content_type,
        }
        response = httpx.post(url, headers=headers, content=data, timeout=30)
        response.raise_for_status()
        return f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{name}"
    (UPLOAD_DIR / name).write_bytes(data)
    return f"/uploads/{name}"
