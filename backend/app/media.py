"""Local-disk photo storage.

No real object storage (Supabase Storage or equivalent) is wired up yet —
see the README's "Ce qui manque" section — so uploaded files just land on
whatever disk the backend process is running on, served back out via
FastAPI's StaticFiles at /uploads. That's genuinely fine for local
development, but the same caveat as Valet Signature's SQLite applies once
this is deployed to a free host like Render: the filesystem there isn't
guaranteed persistent, so an uploaded photo can vanish on a redeploy or a
cold restart. Acceptable for now; revisit once a real storage bucket
exists.
"""
from __future__ import annotations

from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Extension is trusted from content-type, not from the client-supplied
# filename — keeps stored filenames predictable and avoids path tricks.
ALLOWED_CONTENT_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
