from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import ChildCreate, ChildUpdate, ParentInviteCreate
from app.state import _identity, _staff, require_child_access, staff_can_access_child, store

router = APIRouter()


@router.get("/api/v1/children")
def list_children(classroom_id: str | None = None, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    children = store.list_children(member["institution_id"], classroom_id)
    if member["role"] != "owner":
        allowed = set(member.get("classroom_ids") or [])
        children = [c for c in children if c["classroom_id"] in allowed]
    return children


@router.post("/api/v1/children", status_code=201)
def create_child(body: ChildCreate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    if member["role"] != "owner":
        allowed = set(member.get("classroom_ids") or [])
        if not body.classroom_id or body.classroom_id not in allowed:
            raise HTTPException(403, "Vous ne pouvez ajouter un enfant que dans une de vos classes assignées")
    return store.create_child(member["institution_id"], body.first_name, body.last_name, body.birth_date, body.classroom_id)


@router.get("/api/v1/children/{child_id}")
def get_child(child_id: str, authorization: str | None = Header(default=None)):
    _user, child = require_child_access(authorization, child_id)
    return child


@router.patch("/api/v1/children/{child_id}")
def update_child(child_id: str, body: ChildUpdate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    child = store.child(child_id)
    if not child or not staff_can_access_child(member, child):
        raise HTTPException(404, "Enfant introuvable")
    updated = store.update_child(child_id, body.model_dump(exclude_unset=True))
    return updated


@router.get("/api/v1/children/{child_id}/parent-invites")
def list_parent_invites(child_id: str, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    child = store.child(child_id)
    if not child or not staff_can_access_child(member, child):
        raise HTTPException(404, "Enfant introuvable")
    return store.list_parent_invites(child_id)


@router.post("/api/v1/children/{child_id}/parent-invites", status_code=201)
def create_parent_invite(child_id: str, body: ParentInviteCreate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    child = store.child(child_id)
    if not child or not staff_can_access_child(member, child):
        raise HTTPException(404, "Enfant introuvable")
    return store.create_parent_invite(member["institution_id"], child_id, body.email, body.relationship, member["user_id"])


@router.get("/api/v1/parent/children")
def parent_children(authorization: str | None = Header(default=None)):
    user = _identity(authorization)
    return store.parent_children(user["id"])
