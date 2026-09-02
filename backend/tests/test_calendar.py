from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}


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
