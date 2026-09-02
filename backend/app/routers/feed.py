from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import CommentCreate, PostCreate
from app.state import _staff, require_child_access, store

router = APIRouter()


def _with_author(item: dict) -> dict:
    key = "author_user_id"
    return {**item, "author_name": store.author_name(item[key])}


@router.get("/api/v1/feed")
def feed(child_id: str | None = None, authorization: str | None = Header(default=None)):
    if child_id:
        _user, _child = require_child_access(authorization, child_id)
        posts = store.feed_for_child(child_id)
    else:
        member = _staff(authorization)
        posts = store.feed_for_institution(member["institution_id"])
    return [_with_author(post) for post in posts]


@router.post("/api/v1/posts", status_code=201)
def create_post(body: PostCreate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    if body.child_id:
        child = store.child(body.child_id)
        if not child or child["institution_id"] != member["institution_id"]:
            raise HTTPException(404, "Enfant introuvable")
    post = store.create_post(
        member["institution_id"], member["user_id"], body.type,
        child_id=body.child_id, classroom_id=body.classroom_id,
        caption=body.caption, media_url=body.media_url, meal_status=body.meal_status,
    )
    return _with_author(post)


@router.delete("/api/v1/posts/{post_id}", status_code=204)
def delete_post(post_id: str, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    post = store.post(post_id)
    if not post or post["institution_id"] != member["institution_id"]:
        raise HTTPException(404, "Publication introuvable")
    store.delete_post(post_id)


@router.get("/api/v1/posts/{post_id}/comments")
def list_comments(post_id: str, authorization: str | None = Header(default=None)):
    post = store.post(post_id)
    if not post:
        raise HTTPException(404, "Publication introuvable")
    if post["child_id"]:
        require_child_access(authorization, post["child_id"])
    else:
        _staff(authorization)
    return [_with_author(comment) for comment in store.comments_for_post(post_id)]


@router.post("/api/v1/posts/{post_id}/comments", status_code=201)
def add_comment(post_id: str, body: CommentCreate, authorization: str | None = Header(default=None)):
    post = store.post(post_id)
    if not post:
        raise HTTPException(404, "Publication introuvable")
    if post["child_id"]:
        user, _child = require_child_access(authorization, post["child_id"])
        author_id = user["id"]
    else:
        member = _staff(authorization)
        author_id = member["user_id"]
    comment = store.add_comment(post_id, author_id, body.body)
    return _with_author(comment)
