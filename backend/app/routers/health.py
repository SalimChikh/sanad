from fastapi import APIRouter

from app.state import store

router = APIRouter()


@router.get("/api/v1/health")
def health():
    persistent = getattr(store, "enabled", False)
    return {"status": "ok", "storage": "postgres" if persistent else "in-memory"}
