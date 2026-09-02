from __future__ import annotations

import uuid

from fastapi import APIRouter, File, Header, HTTPException, UploadFile

from app.media import ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, UPLOAD_DIR
from app.state import _staff

router = APIRouter()


@router.post("/api/v1/uploads", status_code=201)
async def upload_photo(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    # Only staff post to a child's feed — a parent has no reason to upload
    # a photo today, so this stays staff-only rather than any-caller.
    _staff(authorization)
    extension = ALLOWED_CONTENT_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(422, "Format non supporté. Utilisez JPG, PNG ou WebP.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "L’image dépasse la limite de 5 Mo.")
    name = f"{uuid.uuid4()}{extension}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"path": f"/uploads/{name}"}
