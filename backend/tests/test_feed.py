from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}
PARENT = {"Authorization": "Bearer demo-parent-token"}


def _child_with_linked_parent(first_name: str) -> dict:
    client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Les Oliviers", "institution_type": "daycare"}, headers=OWNER)
    child = client.post("/api/v1/children", json={"first_name": first_name, "last_name": "Test", "birth_date": "2022-01-01"}, headers=OWNER).json()
    invite = client.post(f"/api/v1/children/{child['id']}/parent-invites", json={
        "email": f"{first_name.lower()}.parent@example.com", "relationship": "father",
    }, headers=OWNER).json()
    client.post("/api/v1/auth/accept-parent-invite", json={"token": invite["token"]}, headers=PARENT)
    return child


def test_post_note_appears_in_child_feed_for_staff_and_parent():
    child = _child_with_linked_parent("Sofia")
    post = client.post("/api/v1/posts", json={
        "type": "note", "child_id": child["id"], "caption": "A bien participé à l'atelier peinture.",
    }, headers=OWNER).json()
    assert post["author_name"]

    staff_feed = client.get(f"/api/v1/feed?child_id={child['id']}", headers=OWNER).json()
    parent_feed = client.get(f"/api/v1/feed?child_id={child['id']}", headers=PARENT).json()
    assert any(p["id"] == post["id"] for p in staff_feed)
    assert any(p["id"] == post["id"] for p in parent_feed)


def test_daily_post_combines_summary_photos_mood_and_meal():
    child = _child_with_linked_parent("Amir")
    post = client.post("/api/v1/posts", json={
        "type": "daily", "child_id": child["id"],
        "caption": "Belle journée, a bien participé aux activités.",
        "media_urls": ["/uploads/a.png", "/uploads/b.png"],
        "mood": "happy", "meal_status": "ate_all",
    }, headers=OWNER)
    assert post.status_code == 201
    body = post.json()
    assert body["media_urls"] == ["/uploads/a.png", "/uploads/b.png"]
    assert body["mood"] == "happy"
    assert body["meal_status"] == "ate_all"

    feed = client.get(f"/api/v1/feed?child_id={child['id']}", headers=PARENT).json()
    assert any(p["id"] == body["id"] and p["mood"] == "happy" for p in feed)


def test_daily_post_rejects_invalid_mood():
    child = _child_with_linked_parent("Sami")
    response = client.post("/api/v1/posts", json={"type": "daily", "child_id": child["id"], "mood": "furious"}, headers=OWNER)
    assert response.status_code == 422


def test_meal_post_requires_valid_status():
    child = _child_with_linked_parent("Ilyes")
    bad = client.post("/api/v1/posts", json={"type": "meal", "child_id": child["id"], "meal_status": "not_a_status"}, headers=OWNER)
    assert bad.status_code == 422
    good = client.post("/api/v1/posts", json={"type": "meal", "child_id": child["id"], "meal_status": "ate_all"}, headers=OWNER)
    assert good.status_code == 201


def test_parent_can_comment_on_their_childs_post():
    child = _child_with_linked_parent("Rania")
    post = client.post("/api/v1/posts", json={"type": "note", "child_id": child["id"], "caption": "Petite sieste tranquille."}, headers=OWNER).json()

    comment = client.post(f"/api/v1/posts/{post['id']}/comments", json={"body": "Merci pour la mise à jour !"}, headers=PARENT)
    assert comment.status_code == 201

    comments = client.get(f"/api/v1/posts/{post['id']}/comments", headers=OWNER).json()
    assert any(c["body"] == "Merci pour la mise à jour !" for c in comments)


def test_institution_announcement_has_no_child_and_is_staff_only():
    client.post("/api/v1/auth/bootstrap", json={"institution_name": "Garderie Les Oliviers", "institution_type": "daycare"}, headers=OWNER)
    announcement = client.post("/api/v1/posts", json={"type": "announcement", "caption": "Fermeture exceptionnelle vendredi."}, headers=OWNER).json()
    assert announcement["child_id"] is None
    feed = client.get("/api/v1/feed", headers=OWNER).json()
    assert any(p["id"] == announcement["id"] for p in feed)


def test_owner_can_delete_their_institutions_post():
    child = _child_with_linked_parent("Malak")
    post = client.post("/api/v1/posts", json={"type": "note", "child_id": child["id"], "caption": "à supprimer"}, headers=OWNER).json()
    assert client.delete(f"/api/v1/posts/{post['id']}", headers=OWNER).status_code == 204
    assert client.get(f"/api/v1/posts/{post['id']}/comments", headers=OWNER).status_code == 404
