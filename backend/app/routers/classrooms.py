from fastapi import APIRouter, Header

from app.models.schemas import ClassroomCreate
from app.state import _staff, store

router = APIRouter()


@router.get("/api/v1/classrooms")
def list_classrooms(authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    return store.list_classrooms(member["institution_id"])


@router.post("/api/v1/classrooms", status_code=201)
def create_classroom(body: ClassroomCreate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    return store.create_classroom(member["institution_id"], body.name, body.age_group)
