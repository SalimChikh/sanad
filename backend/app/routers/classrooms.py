from fastapi import APIRouter, Header, HTTPException

from app.models.schemas import ClassroomCreate, ClassroomUpdate
from app.state import _owner, _staff, store

router = APIRouter()


@router.get("/api/v1/classrooms")
def list_classrooms(authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    return store.list_classrooms(member["institution_id"])


@router.post("/api/v1/classrooms", status_code=201)
def create_classroom(body: ClassroomCreate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    return store.create_classroom(member["institution_id"], body.name, body.age_group)


@router.get("/api/v1/classrooms/{classroom_id}")
def get_classroom(classroom_id: str, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    classroom = store.classroom(classroom_id)
    if not classroom or classroom["institution_id"] != member["institution_id"]:
        raise HTTPException(404, "Classe introuvable")
    return classroom


@router.patch("/api/v1/classrooms/{classroom_id}")
def update_classroom(classroom_id: str, body: ClassroomUpdate, authorization: str | None = Header(default=None)):
    member = _staff(authorization)
    classroom = store.classroom(classroom_id)
    if not classroom or classroom["institution_id"] != member["institution_id"]:
        raise HTTPException(404, "Classe introuvable")
    return store.update_classroom(classroom_id, body.model_dump(exclude_unset=True))


@router.delete("/api/v1/classrooms/{classroom_id}", status_code=204)
def delete_classroom(classroom_id: str, authorization: str | None = Header(default=None)):
    # Owner-only: deleting a classroom unassigns every child and educator
    # tied to it — a bigger structural move than creating/renaming one.
    member = _owner(authorization)
    if not store.delete_classroom(member["institution_id"], classroom_id):
        raise HTTPException(404, "Classe introuvable")
