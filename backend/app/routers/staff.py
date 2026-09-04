from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import StaffClassroomsUpdate, StaffInviteCreate
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
    # classroom_ids only matters for an educator invite — an owner invite
    # ignores whatever was passed, since an owner is never scope-restricted.
    classroom_ids = body.classroom_ids if body.role == "educator" else []
    return store.create_staff_invite(member["institution_id"], body.email, body.role, member["user_id"], classroom_ids)


@router.delete("/api/v1/staff/invites/{invite_id}", status_code=204)
def cancel_staff_invite(invite_id: str, authorization: str | None = Header(default=None)):
    member = _owner(authorization)
    if not store.cancel_staff_invite(member["institution_id"], invite_id):
        raise HTTPException(404, "Invitation introuvable")


@router.patch("/api/v1/staff/{user_id}/classrooms", status_code=204)
def update_staff_classrooms(user_id: str, body: StaffClassroomsUpdate, authorization: str | None = Header(default=None)):
    member = _owner(authorization)
    if not store.update_staff_classrooms(member["institution_id"], user_id, body.classroom_ids):
        raise HTTPException(404, "Membre du personnel introuvable")
