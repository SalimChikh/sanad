from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}
PARENT = {"Authorization": "Bearer demo-parent-token"}


def _ensure_institution():
    client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Les Oliviers", "institution_type": "daycare"}, headers=OWNER)


def test_create_classroom_and_child():
    _ensure_institution()
    classroom = client.post("/api/v1/classrooms", json={"name": "Petits (2-3 ans)", "age_group": "2-3"}, headers=OWNER).json()
    child = client.post("/api/v1/children", json={
        "first_name": "Amine", "last_name": "Belkacem", "classroom_id": classroom["id"],
    }, headers=OWNER).json()
    assert child["classroom_id"] == classroom["id"]
    children = client.get("/api/v1/children", headers=OWNER).json()
    assert any(c["id"] == child["id"] for c in children)


def test_update_child():
    _ensure_institution()
    child = client.post("/api/v1/children", json={"first_name": "Yasmine", "last_name": "Cherif"}, headers=OWNER).json()
    updated = client.patch(f"/api/v1/children/{child['id']}", json={"notes": "Allergique aux arachides"}, headers=OWNER).json()
    assert updated["notes"] == "Allergique aux arachides"


def test_parent_invite_accept_and_visibility():
    _ensure_institution()
    child = client.post("/api/v1/children", json={"first_name": "Nadia", "last_name": "Haddad"}, headers=OWNER).json()

    invite = client.post(f"/api/v1/children/{child['id']}/parent-invites", json={
        "email": "parent@example.com", "relationship": "mother",
    }, headers=OWNER).json()
    assert invite["token"]

    # Not accepted yet: the parent has no visibility on this child.
    assert not any(c["id"] == child["id"] for c in client.get("/api/v1/parent/children", headers=PARENT).json())

    accepted = client.post("/api/v1/auth/accept-parent-invite", json={"token": invite["token"]}, headers=PARENT)
    assert accepted.status_code == 200
    assert accepted.json()["id"] == child["id"]

    children = client.get("/api/v1/parent/children", headers=PARENT).json()
    assert any(c["id"] == child["id"] for c in children)

    # A stale/already-used token is rejected, not silently re-accepted.
    replay = client.post("/api/v1/auth/accept-parent-invite", json={"token": invite["token"]}, headers=PARENT)
    assert replay.status_code == 404


def test_child_access_denied_to_unrelated_parent():
    _ensure_institution()
    child = client.post("/api/v1/children", json={"first_name": "Karim", "last_name": "Belaid"}, headers=OWNER).json()
    # This parent was never invited for this specific child — require_child_access
    # must reject both the child record itself and its feed.
    assert client.get(f"/api/v1/children/{child['id']}", headers=PARENT).status_code == 403
    assert client.get(f"/api/v1/feed?child_id={child['id']}", headers=PARENT).status_code == 403


def test_staff_invite_list_and_cancel():
    _ensure_institution()
    invite = client.post("/api/v1/staff/invites", json={"email": "educateur@example.com", "role": "educator"}, headers=OWNER).json()
    listed = client.get("/api/v1/staff", headers=OWNER).json()
    assert any(i["id"] == invite["id"] for i in listed["invites"])
    assert client.delete(f"/api/v1/staff/invites/{invite['id']}", headers=OWNER).status_code == 204
    listed_after = client.get("/api/v1/staff", headers=OWNER).json()
    assert not any(i["id"] == invite["id"] for i in listed_after["invites"])
