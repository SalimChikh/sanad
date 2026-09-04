from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}
EDUCATOR = {"Authorization": "Bearer demo-educator-token"}


def _setup():
    """One institution, two classrooms, the shared demo educator assigned
    only to the first one — everything below is scoped against that."""
    client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Scoping", "institution_type": "daycare"}, headers=OWNER)
    classroom_a = client.post("/api/v1/classrooms", json={"name": "Classe A"}, headers=OWNER).json()
    classroom_b = client.post("/api/v1/classrooms", json={"name": "Classe B"}, headers=OWNER).json()

    invite = client.post("/api/v1/staff/invites", json={
        "email": "educator@example.com", "role": "educator", "classroom_ids": [classroom_a["id"]],
    }, headers=OWNER).json()
    client.post("/api/v1/auth/accept-staff-invite", json={"token": invite["token"]}, headers=EDUCATOR)

    child_in_a = client.post("/api/v1/children", json={"first_name": "DansA", "last_name": "Test", "classroom_id": classroom_a["id"]}, headers=OWNER).json()
    child_in_b = client.post("/api/v1/children", json={"first_name": "DansB", "last_name": "Test", "classroom_id": classroom_b["id"]}, headers=OWNER).json()
    return classroom_a, classroom_b, child_in_a, child_in_b


def test_educator_only_sees_children_in_their_assigned_classroom():
    _classroom_a, _classroom_b, child_in_a, child_in_b = _setup()
    ids = {c["id"] for c in client.get("/api/v1/children", headers=EDUCATOR).json()}
    assert child_in_a["id"] in ids
    assert child_in_b["id"] not in ids


def test_owner_still_sees_every_child_regardless_of_classroom():
    _classroom_a, _classroom_b, child_in_a, child_in_b = _setup()
    ids = {c["id"] for c in client.get("/api/v1/children", headers=OWNER).json()}
    assert {child_in_a["id"], child_in_b["id"]} <= ids


def test_educator_cannot_view_or_edit_a_child_outside_their_classroom():
    _classroom_a, _classroom_b, _child_in_a, child_in_b = _setup()
    assert client.get(f"/api/v1/children/{child_in_b['id']}", headers=EDUCATOR).status_code == 404
    patch = client.patch(f"/api/v1/children/{child_in_b['id']}", json={"notes": "test"}, headers=EDUCATOR)
    assert patch.status_code == 404


def test_educator_can_post_for_a_child_in_their_classroom_but_not_outside_it():
    _classroom_a, _classroom_b, child_in_a, child_in_b = _setup()
    ok = client.post("/api/v1/posts", json={"type": "note", "child_id": child_in_a["id"], "caption": "ok"}, headers=EDUCATOR)
    assert ok.status_code == 201

    blocked = client.post("/api/v1/posts", json={"type": "note", "child_id": child_in_b["id"], "caption": "non"}, headers=EDUCATOR)
    assert blocked.status_code == 404


def test_educator_cannot_create_an_institution_wide_announcement():
    _setup()
    response = client.post("/api/v1/posts", json={"type": "announcement", "caption": "Annonce"}, headers=EDUCATOR)
    assert response.status_code == 403


def test_owner_can_create_an_institution_wide_announcement():
    _setup()
    response = client.post("/api/v1/posts", json={"type": "announcement", "caption": "Annonce"}, headers=OWNER)
    assert response.status_code == 201


def test_educator_cannot_add_a_child_outside_their_classroom():
    classroom_a, classroom_b, _child_in_a, _child_in_b = _setup()
    blocked = client.post("/api/v1/children", json={"first_name": "Nouvel", "last_name": "Enfant", "classroom_id": classroom_b["id"]}, headers=EDUCATOR)
    assert blocked.status_code == 403

    allowed = client.post("/api/v1/children", json={"first_name": "Nouvel", "last_name": "Enfant", "classroom_id": classroom_a["id"]}, headers=EDUCATOR)
    assert allowed.status_code == 201


def test_owner_can_update_an_educators_classroom_assignment():
    classroom_a, classroom_b, _child_in_a, child_in_b = _setup()
    me = client.get("/api/v1/auth/me", headers=EDUCATOR).json()

    response = client.patch(f"/api/v1/staff/{me['user_id']}/classrooms", json={"classroom_ids": [classroom_a["id"], classroom_b["id"]]}, headers=OWNER)
    assert response.status_code == 204

    ids = {c["id"] for c in client.get("/api/v1/children", headers=EDUCATOR).json()}
    assert child_in_b["id"] in ids


def test_deactivating_a_child_removes_them_from_the_list_but_keeps_history():
    _classroom_a, _classroom_b, child_in_a, _child_in_b = _setup()
    response = client.patch(f"/api/v1/children/{child_in_a['id']}", json={"active": False}, headers=OWNER)
    assert response.status_code == 200
    assert response.json()["active"] is False

    ids = {c["id"] for c in client.get("/api/v1/children", headers=OWNER).json()}
    assert child_in_a["id"] not in ids

    # Still directly reachable (history preserved) — just not in listings.
    direct = client.get(f"/api/v1/children/{child_in_a['id']}", headers=OWNER)
    assert direct.status_code == 200
    assert direct.json()["active"] is False
