from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


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
    birth_date: str | None = None
    classroom_id: str | None = None


class ChildUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    birth_date: str | None = None
    classroom_id: str | None = None
    notes: str | None = Field(default=None, max_length=2000)
    photo_url: str | None = None
    active: bool | None = None


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
