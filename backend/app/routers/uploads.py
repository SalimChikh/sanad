from __future__ import annotations

from fastapi import APIRouter, File, Header, HTTPException, UploadFile

from app.media import ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, save_upload
from app.state import _staff

router = APIRouter()


@router.post("/api/v1/uploads", status_code=201)
async def upload_photo(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    # Only staff post to a child's feed — a parent has no reason to upload
    # a photo today, so this stays staff-only rather than any-caller.
    _staff(authorization)
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(422, "Format non supporté. Utilisez JPG, PNG ou WebP.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "L’image dépasse la limite de 5 Mo.")
    path = save_upload(data, content_type)
    return {"path": path}
