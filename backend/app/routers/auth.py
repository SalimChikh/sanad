from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import AcceptInvite, BootstrapRequest
from app.state import _identity, store

router = APIRouter()


@router.get("/api/v1/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    user = _identity(authorization)
    membership = store.staff_membership(user["id"])
    if membership:
        return membership
    children = store.parent_children(user["id"])
    if children:
        return {"kind": "parent", "user_id": user["id"], "email": user.get("email"), "children": children}
    # Neither staff nor a linked parent yet — the frontend routes this to
    # "create your institution" (owner) vs "waiting for an invite" (parent
    # who followed a stale/expired link, or hasn't been invited at all).
    raise HTTPException(404, "Aucun établissement ni enfant associé à ce compte")


@router.post("/api/v1/auth/bootstrap")
def bootstrap(body: BootstrapRequest, authorization: str | None = Header(default=None)):
    user = _identity(authorization)
    return store.bootstrap_institution(user["id"], body.institution_name, body.institution_type)


@router.post("/api/v1/auth/accept-staff-invite")
def accept_staff_invite(body: AcceptInvite, authorization: str | None = Header(default=None)):
    user = _identity(authorization)
    membership = store.accept_staff_invite(body.token, user["id"])
    if not membership:
        raise HTTPException(404, "Invitation introuvable ou déjà utilisée")
    return membership


@router.post("/api/v1/auth/accept-parent-invite")
def accept_parent_invite(body: AcceptInvite, authorization: str | None = Header(default=None)):
    user = _identity(authorization)
    child = store.accept_parent_invite(body.token, user["id"])
    if not child:
        raise HTTPException(404, "Invitation introuvable ou déjà utilisée")
    return child
