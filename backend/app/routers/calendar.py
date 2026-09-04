from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import CalendarEventCreate
from app.state import _identity, _staff, require_child_access, store

router = APIRouter()


@router.get("/api/v1/calendar-events")
def list_events(child_id: str | None = None, authorization: str | None = Header(default=None)):
    if child_id:
        _user, child = require_child_access(authorization, child_id)
        return store.list_events(child["institution_id"])

    # No child_id: staff sees their whole institution's calendar. A parent
    # has no staff membership (this used to just 403 them — the parent-side
    # /app/calendar route was silently broken) — for a parent, show events
    # from every institution any of their linked children belongs to.
    user = _identity(authorization)
    membership = store.staff_membership(user["id"])
    if membership:
        return store.list_events(membership["institution_id"])

    institution_ids = {child["institution_id"] for child in store.parent_children(user["id"])}
    events = [event for institution_id in institution_ids for event in store.list_events(institution_id)]
    return sorted(events, key=lambda event: event["start_at"])


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
