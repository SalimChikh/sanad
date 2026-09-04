from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}
PARENT = {"Authorization": "Bearer demo-parent-token"}


def _ensure_institution():
    client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Les Oliviers", "institution_type": "daycare"}, headers=OWNER)


def test_create_list_and_delete_event():
    _ensure_institution()
    event = client.post("/api/v1/calendar-events", json={
        "title": "Sortie au jardin botanique", "start_at": "2026-10-05T09:00:00Z", "all_day": False,
    }, headers=OWNER).json()
    events = client.get("/api/v1/calendar-events", headers=OWNER).json()
    assert any(e["id"] == event["id"] for e in events)

    assert client.delete(f"/api/v1/calendar-events/{event['id']}", headers=OWNER).status_code == 204
    assert client.delete(f"/api/v1/calendar-events/{event['id']}", headers=OWNER).status_code == 404


def test_events_are_sorted_by_start_date():
    _ensure_institution()
    client.post("/api/v1/calendar-events", json={"title": "Second", "start_at": "2026-11-02T09:00:00Z"}, headers=OWNER)
    client.post("/api/v1/calendar-events", json={"title": "First", "start_at": "2026-11-01T09:00:00Z"}, headers=OWNER)
    events = [e for e in client.get("/api/v1/calendar-events", headers=OWNER).json() if e["title"] in ("First", "Second")]
    assert [e["title"] for e in events] == ["First", "Second"]


def test_linked_parent_sees_their_childs_institution_calendar_without_child_id():
    # Regression: /calendar-events with no child_id used to always require a
    # staff membership, so the parent-side /app/calendar route 403'd for
    # every parent — a parent is never staff.
    _ensure_institution()
    child = client.post("/api/v1/children", json={"first_name": "Calendrier", "last_name": "Enfant"}, headers=OWNER).json()
    invite = client.post(f"/api/v1/children/{child['id']}/parent-invites", json={
        "email": "calendrier.parent@example.com", "relationship": "mother",
    }, headers=OWNER).json()
    client.post("/api/v1/auth/accept-parent-invite", json={"token": invite["token"]}, headers=PARENT)

    event = client.post("/api/v1/calendar-events", json={
        "title": "Fête de fin d'année", "start_at": "2026-12-15T10:00:00Z",
    }, headers=OWNER).json()

    response = client.get("/api/v1/calendar-events", headers=PARENT)
    assert response.status_code == 200
    assert any(e["id"] == event["id"] for e in response.json())


def test_parent_calendar_never_403s_even_without_a_staff_membership():
    # Not asserting an empty list here: the shared demo-parent identity may
    # already be linked to children from other tests in this suite (same
    # in-memory store, same fixed demo "sub" for the whole process) — the
    # regression this guards against is the 403, not the exact content.
    response = client.get("/api/v1/calendar-events", headers=PARENT)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
