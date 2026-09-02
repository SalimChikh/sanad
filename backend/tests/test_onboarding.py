from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}


def test_health_reports_storage_mode():
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["storage"] in ("in-memory", "postgres")


def test_unauthenticated_request_is_rejected():
    assert client.get("/api/v1/classrooms").status_code == 401


def test_bootstrap_is_idempotent():
    # Same demo owner "sub" every call — bootstrapping twice must return the
    # same institution rather than creating a second one (matches the check
    # in Store.bootstrap_institution / DatabaseStore.bootstrap_institution).
    first = client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Les Oliviers", "institution_type": "daycare"}, headers=OWNER)
    second = client.post("/api/v1/auth/bootstrap", json={"institution_name": "Une Autre Ecole", "institution_type": "school"}, headers=OWNER)
    assert first.status_code == 200
    assert second.json()["institution_id"] == first.json()["institution_id"]


def test_auth_me_reflects_staff_membership():
    client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Les Oliviers", "institution_type": "daycare"}, headers=OWNER)
    me = client.get("/api/v1/auth/me", headers=OWNER).json()
    assert me["kind"] == "staff"
    assert me["role"] == "owner"
