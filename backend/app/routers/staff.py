from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import StaffInviteCreate
from app.state import _owner, _staff, store

router = APIRouter()


@router.get("/api/v1/staff")
def list_staff(authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    return {
        "members": store.institution_staff(member["institution_id"]),
        "invites": store.list_staff_invites(member["institution_id"]),
    }


@router.post("/api/v1/staff/invites", status_code=201)
def invite_staff(body: StaffInviteCreate, authorization: str | None = Header(default=None)):
    member = _owner(authorization)
    return store.create_staff_invite(member["institution_id"], body.email, body.role, member["user_id"])


@router.delete("/api/v1/staff/invites/{invite_id}", status_code=204)
def cancel_staff_invite(invite_id: str, authorization: str | None = Header(default=None)):
    member = _owner(authorization)
    if not store.cancel_staff_invite(member["institution_id"], invite_id):
        raise HTTPException(404, "Invitation introuvable")
