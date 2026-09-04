from __future__ import annotations

from datetime import date

from pydantic import BaseModel, EmailStr, Field, field_validator


class BootstrapRequest(BaseModel):
    institution_name: str = Field(min_length=1, max_length=120)
    institution_type: str = Field(pattern=r"^(school|daycare)$")


class StaffInviteCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="educator", pattern=r"^(owner|educator)$")
    # Which classes this educator will be scoped to once they accept —
    # ignored for role="owner" invites (an owner is never restricted).
    classroom_ids: list[str] = Field(default_factory=list)


class StaffClassroomsUpdate(BaseModel):
    classroom_ids: list[str] = Field(default_factory=list)


class AcceptInvite(BaseModel):
    token: str


class ClassroomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    age_group: str | None = Field(default=None, max_length=40)


class ChildCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    # A real calendar date, and required — a child's birth date is core to
    # what the app is for (age groups, per-child records), and a plain
    # `str | None` let " " or "31/02/2026" through silently before this.
    birth_date: date
    classroom_id: str | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Ce champ ne peut pas être vide.")
        return stripped

    @field_validator("birth_date")
    @classmethod
    def _not_in_the_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("La date de naissance ne peut pas être dans le futur.")
        return value


class ChildUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    birth_date: date | None = None
    classroom_id: str | None = None
    notes: str | None = Field(default=None, max_length=2000)
    photo_url: str | None = None
    active: bool | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def _not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("Ce champ ne peut pas être vide.")
        return stripped

    @field_validator("birth_date")
    @classmethod
    def _not_in_the_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("La date de naissance ne peut pas être dans le futur.")
        return value


class ParentInviteCreate(BaseModel):
    email: EmailStr
    relationship: str = Field(default="guardian", pattern=r"^(mother|father|guardian)$")


class PostCreate(BaseModel):
    type: str = Field(pattern=r"^(photo|note|meal|nap|activity|announcement)$")
    child_id: str | None = None
    classroom_id: str | None = None
    caption: str | None = Field(default=None, max_length=2000)
    media_url: str | None = None
    meal_status: str | None = Field(default=None, pattern=r"^(ate_all|ate_some|refused)$")


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class CalendarEventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str | None = Field(default=None, max_length=2000)
    start_at: str
    end_at: str | None = None
    all_day: bool = False
    classroom_id: str | None = None
