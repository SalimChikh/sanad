from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import CalendarEventCreate
from app.state import _staff, require_child_access, store

router = APIRouter()


@router.get("/api/v1/calendar-events")
def list_events(child_id: str | None = None, authorization: str | None = Header(default=None)):
    if child_id:
        _user, child = require_child_access(authorization, child_id)
        institution_id = child["institution_id"]
    else:
        institution_id = _staff(authorization)["institution_id"]
    return store.list_events(institution_id)


@router.post("/api/v1/calendar-events", status_code=201)
def create_event(body: CalendarEventCreate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    return store.create_event(
        member["institution_id"], member["user_id"], body.title, body.start_at,
        classroom_id=body.classroom_id, description=body.description, end_at=body.end_at, all_day=body.all_day,
    )


@router.delete("/api/v1/calendar-events/{event_id}", status_code=204)
def delete_event(event_id: str, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    if not store.delete_event(member["institution_id"], event_id):
        raise HTTPException(404, "Événement introuvable")
