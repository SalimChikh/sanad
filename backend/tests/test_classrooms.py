from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}
EDUCATOR = {"Authorization": "Bearer demo-educator-token"}


def _ensure_institution():
    client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Les Oliviers", "institution_type": "daycare"}, headers=OWNER)


def test_get_classroom_by_id():
    _ensure_institution()
    classroom = client.post("/api/v1/classrooms", json={"name": "Détail Test", "age_group": "3-4"}, headers=OWNER).json()
    response = client.get(f"/api/v1/classrooms/{classroom['id']}", headers=OWNER)
    assert response.status_code == 200
    assert response.json()["name"] == "Détail Test"


def test_get_classroom_not_found():
    _ensure_institution()
    response = client.get("/api/v1/classrooms/00000000-0000-0000-0000-000000000099", headers=OWNER)
    assert response.status_code == 404


def test_update_classroom_name_and_age_group():
    _ensure_institution()
    classroom = client.post("/api/v1/classrooms", json={"name": "Avant", "age_group": "2-3"}, headers=OWNER).json()
    updated = client.patch(f"/api/v1/classrooms/{classroom['id']}", json={"name": "Après", "age_group": "3-4"}, headers=OWNER)
    assert updated.status_code == 200
    assert updated.json()["name"] == "Après"
    assert updated.json()["age_group"] == "3-4"


def test_delete_classroom_requires_owner():
    _ensure_institution()
    classroom = client.post("/api/v1/classrooms", json={"name": "A Supprimer Non Owner"}, headers=OWNER).json()
    response = client.delete(f"/api/v1/classrooms/{classroom['id']}", headers=EDUCATOR)
    assert response.status_code == 403


def test_delete_classroom_unassigns_children_and_educators_instead_of_failing():
    _ensure_institution()
    classroom = client.post("/api/v1/classrooms", json={"name": "A Supprimer"}, headers=OWNER).json()
    child = client.post("/api/v1/children", json={
        "first_name": "OrphanTest", "last_name": "Enfant", "birth_date": "2022-01-01", "classroom_id": classroom["id"],
    }, headers=OWNER).json()

    invite = client.post("/api/v1/staff/invites", json={
        "email": "delclass@example.com", "role": "educator", "classroom_ids": [classroom["id"]],
    }, headers=OWNER).json()
    client.post("/api/v1/auth/accept-staff-invite", json={"token": invite["token"]}, headers=EDUCATOR)

    assert client.delete(f"/api/v1/classrooms/{classroom['id']}", headers=OWNER).status_code == 204
    assert client.get(f"/api/v1/classrooms/{classroom['id']}", headers=OWNER).status_code == 404

    child_after = client.get(f"/api/v1/children/{child['id']}", headers=OWNER).json()
    assert child_after["classroom_id"] is None

    educator_after = client.get("/api/v1/auth/me", headers=EDUCATOR).json()
    assert classroom["id"] not in educator_after["classroom_ids"]
