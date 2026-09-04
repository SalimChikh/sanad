"""In-memory data store — Sanad's equivalent of Fidli's demo mode.

Same reasoning as Fidli's early stages: this needs no external database to
run and test locally, right now, before a real Supabase/Postgres project
exists for this app. The shape of every method here mirrors
`supabase/migrations/202609020001_init.sql` closely enough that swapping in
a real SQL-backed provider later (same pattern as Fidli's
`app/providers/database/postgres.py`) is a matter of re-implementing this
same interface against real tables, not redesigning the API layer above it.
Nothing here persists across a process restart — acceptable for local
development and demos, not for production.
"""
from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Literal

Role = Literal["owner", "educator"]
PostType = Literal["photo", "note", "meal", "nap", "activity", "announcement"]


def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "etablissement"
    return f"{base}-{secrets.token_hex(3)}"


class Store:
    def __init__(self) -> None:
        self._lock = Lock()
        self.users: dict[str, dict[str, Any]] = {}
        self.institutions: dict[str, dict[str, Any]] = {}
        self.staff: dict[str, dict[str, Any]] = {}  # id -> {user_id, institution_id, role, active}
        self.classrooms: dict[str, dict[str, Any]] = {}
        self.children: dict[str, dict[str, Any]] = {}
        self.parent_links: dict[str, dict[str, Any]] = {}
        self.parent_invites: dict[str, dict[str, Any]] = {}
        self.staff_invites: dict[str, dict[str, Any]] = {}
        self.posts: dict[str, dict[str, Any]] = {}
        self.comments: dict[str, dict[str, Any]] = {}
        self.calendar_events: dict[str, dict[str, Any]] = {}

    # ---------------------------------------------------------------- identity
    def resolve_user(self, auth_provider: str, auth_subject: str, email: str | None, full_name: str | None = None) -> dict[str, Any]:
        with self._lock:
            for user in self.users.values():
                if user["auth_provider"] == auth_provider and user["auth_subject"] == auth_subject:
                    if email:
                        user["email"] = email
                    if full_name:
                        user["full_name"] = full_name
                    return user
            user = {
                "id": _uid(), "auth_provider": auth_provider, "auth_subject": auth_subject,
                "email": email, "full_name": full_name, "created_at": _now(),
            }
            self.users[user["id"]] = user
            return user

    # ---------------------------------------------------------------- staff / institution
    def staff_membership(self, user_id: str) -> dict[str, Any] | None:
        for rec in self.staff.values():
            if rec["user_id"] == user_id and rec["active"]:
                inst = self.institutions[rec["institution_id"]]
                return {
                    "kind": "staff", "user_id": user_id, "role": rec["role"],
                    "institution_id": inst["id"], "institution_name": inst["name"],
                    "institution_type": inst["type"], "slug": inst["slug"], "status": inst["status"],
                    "primary_color": inst["primary_color"], "logo_url": inst["logo_url"],
                    # Only meaningful for educators — an owner is always
                    # unrestricted regardless of what's stored here (every
                    # caller checks role == "owner" before consulting this).
                    "classroom_ids": rec.get("classroom_ids", []),
                }
        return None

    def bootstrap_institution(self, user_id: str, name: str, type_: str) -> dict[str, Any]:
        existing = self.staff_membership(user_id)
        if existing:
            return existing
        inst_id = _uid()
        institution = {
            "id": inst_id, "name": name, "slug": _slugify(name), "type": type_, "status": "active",
            "city": None, "country_code": "DZ", "max_children": 30,
            "logo_url": None, "primary_color": "#2d6a4f", "created_at": _now(),
        }
        self.institutions[inst_id] = institution
        staff_id = _uid()
        self.staff[staff_id] = {
            "id": staff_id, "user_id": user_id, "institution_id": inst_id, "role": "owner",
            "active": True, "created_at": _now(), "classroom_ids": [],
        }
        return self.staff_membership(user_id)  # type: ignore[return-value]

    def institution_staff(self, institution_id: str) -> list[dict[str, Any]]:
        out = []
        for rec in self.staff.values():
            if rec["institution_id"] == institution_id:
                user = self.users.get(rec["user_id"], {})
                out.append({**rec, "email": user.get("email"), "full_name": user.get("full_name")})
        return out

    def update_staff_classrooms(self, institution_id: str, user_id: str, classroom_ids: list[str]) -> bool:
        for rec in self.staff.values():
            if rec["institution_id"] == institution_id and rec["user_id"] == user_id and rec["active"]:
                rec["classroom_ids"] = classroom_ids
                return True
        return False

    def create_staff_invite(self, institution_id: str, email: str, role: Role, created_by: str, classroom_ids: list[str] | None = None) -> dict[str, Any]:
        invite_id = _uid()
        invite = {
            "id": invite_id, "institution_id": institution_id, "email": email.strip().lower(), "role": role,
            "token": secrets.token_urlsafe(24), "created_by": created_by, "created_at": _now(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(), "accepted_at": None,
            "classroom_ids": classroom_ids or [],
        }
        self.staff_invites[invite_id] = invite
        return invite

    def list_staff_invites(self, institution_id: str) -> list[dict[str, Any]]:
        return [i for i in self.staff_invites.values() if i["institution_id"] == institution_id and not i["accepted_at"]]

    def cancel_staff_invite(self, institution_id: str, invite_id: str) -> bool:
        invite = self.staff_invites.get(invite_id)
        if not invite or invite["institution_id"] != institution_id:
            return False
        del self.staff_invites[invite_id]
        return True

    def accept_staff_invite(self, token: str, user_id: str) -> dict[str, Any] | None:
        invite = next((i for i in self.staff_invites.values() if i["token"] == token and not i["accepted_at"]), None)
        if not invite:
            return None
        invite["accepted_at"] = _now()
        # Update in place if this user is already (or was) staff at this
        # institution, instead of always inserting a new record — mirrors
        # DatabaseStore's `on conflict (user_id, institution_id) do update`
        # and matters as soon as the same person is invited more than once
        # (role change, or a second batch of classes): staff_membership()
        # returns the first *active* match it finds, so a stray duplicate
        # record would silently keep serving stale data forever.
        existing = next((rec for rec in self.staff.values() if rec["user_id"] == user_id and rec["institution_id"] == invite["institution_id"]), None)
        if existing:
            existing["role"] = invite["role"]
            existing["active"] = True
            existing["classroom_ids"] = invite.get("classroom_ids", [])
        else:
            staff_id = _uid()
            self.staff[staff_id] = {
                "id": staff_id, "user_id": user_id, "institution_id": invite["institution_id"],
                "role": invite["role"], "active": True, "created_at": _now(),
                "classroom_ids": invite.get("classroom_ids", []),
            }
        return self.staff_membership(user_id)

    # ---------------------------------------------------------------- classrooms
    def create_classroom(self, institution_id: str, name: str, age_group: str | None) -> dict[str, Any]:
        classroom_id = _uid()
        classroom = {"id": classroom_id, "institution_id": institution_id, "name": name, "age_group": age_group, "created_at": _now()}
        self.classrooms[classroom_id] = classroom
        return classroom

    def list_classrooms(self, institution_id: str) -> list[dict[str, Any]]:
        return [c for c in self.classrooms.values() if c["institution_id"] == institution_id]

    # ---------------------------------------------------------------- children
    def create_child(self, institution_id: str, first_name: str, last_name: str, birth_date: str | None, classroom_id: str | None) -> dict[str, Any]:
        child_id = _uid()
        child = {
            "id": child_id, "institution_id": institution_id, "classroom_id": classroom_id,
            "first_name": first_name, "last_name": last_name, "birth_date": birth_date,
            "photo_url": None, "notes": None, "active": True, "created_at": _now(), "updated_at": _now(),
        }
        self.children[child_id] = child
        return child

    def list_children(self, institution_id: str, classroom_id: str | None = None, include_inactive: bool = False) -> list[dict[str, Any]]:
        items = [c for c in self.children.values() if c["institution_id"] == institution_id and (include_inactive or c["active"])]
        if classroom_id:
            items = [c for c in items if c["classroom_id"] == classroom_id]
        return sorted(items, key=lambda c: c["first_name"])

    def child(self, child_id: str) -> dict[str, Any] | None:
        return self.children.get(child_id)

    def update_child(self, child_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        child = self.children.get(child_id)
        if not child:
            return None
        child.update(patch)
        child["updated_at"] = _now()
        return child

    # ---------------------------------------------------------------- parents
    def create_parent_invite(self, institution_id: str, child_id: str, email: str, relationship: str, created_by: str) -> dict[str, Any]:
        invite_id = _uid()
        invite = {
            "id": invite_id, "institution_id": institution_id, "child_id": child_id,
            "email": email.strip().lower(), "relationship": relationship, "token": secrets.token_urlsafe(24),
            "created_by": created_by, "created_at": _now(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(), "accepted_at": None,
        }
        self.parent_invites[invite_id] = invite
        return invite

    def list_parent_invites(self, child_id: str) -> list[dict[str, Any]]:
        return [i for i in self.parent_invites.values() if i["child_id"] == child_id and not i["accepted_at"]]

    def accept_parent_invite(self, token: str, user_id: str) -> dict[str, Any] | None:
        invite = next((i for i in self.parent_invites.values() if i["token"] == token and not i["accepted_at"]), None)
        if not invite:
            return None
        invite["accepted_at"] = _now()
        link_id = _uid()
        self.parent_links[link_id] = {
            "id": link_id, "child_id": invite["child_id"], "parent_user_id": user_id,
            "relationship": invite["relationship"], "created_at": _now(),
        }
        return self.child(invite["child_id"])

    def parent_children(self, user_id: str) -> list[dict[str, Any]]:
        child_ids = {link["child_id"] for link in self.parent_links.values() if link["parent_user_id"] == user_id}
        return [self.children[cid] for cid in child_ids if cid in self.children]

    def is_parent_of(self, user_id: str, child_id: str) -> bool:
        return any(link["parent_user_id"] == user_id and link["child_id"] == child_id for link in self.parent_links.values())

    # ---------------------------------------------------------------- feed
    def create_post(
        self, institution_id: str, author_user_id: str, type_: PostType, *,
        child_id: str | None = None, classroom_id: str | None = None,
        caption: str | None = None, media_url: str | None = None, meal_status: str | None = None,
    ) -> dict[str, Any]:
        post_id = _uid()
        post = {
            "id": post_id, "institution_id": institution_id, "child_id": child_id, "classroom_id": classroom_id,
            "author_user_id": author_user_id, "type": type_, "caption": caption, "media_url": media_url,
            "meal_status": meal_status, "created_at": _now(),
        }
        self.posts[post_id] = post
        return post

    def feed_for_child(self, child_id: str) -> list[dict[str, Any]]:
        items = [p for p in self.posts.values() if p["child_id"] == child_id]
        return sorted(items, key=lambda p: p["created_at"], reverse=True)

    def feed_for_institution(self, institution_id: str) -> list[dict[str, Any]]:
        """Institution-wide announcements — posts with no specific child."""
        items = [p for p in self.posts.values() if p["institution_id"] == institution_id and p["child_id"] is None]
        return sorted(items, key=lambda p: p["created_at"], reverse=True)

    def post(self, post_id: str) -> dict[str, Any] | None:
        return self.posts.get(post_id)

    def delete_post(self, post_id: str) -> bool:
        if post_id not in self.posts:
            return False
        del self.posts[post_id]
        for cid in [c["id"] for c in self.comments.values() if c["post_id"] == post_id]:
            del self.comments[cid]
        return True

    # ---------------------------------------------------------------- comments
    def add_comment(self, post_id: str, author_user_id: str, body: str) -> dict[str, Any]:
        comment_id = _uid()
        comment = {"id": comment_id, "post_id": post_id, "author_user_id": author_user_id, "body": body, "created_at": _now()}
        self.comments[comment_id] = comment
        return comment

    def comments_for_post(self, post_id: str) -> list[dict[str, Any]]:
        items = [c for c in self.comments.values() if c["post_id"] == post_id]
        return sorted(items, key=lambda c: c["created_at"])

    # ---------------------------------------------------------------- calendar
    def create_event(
        self, institution_id: str, created_by: str, title: str, start_at: str, *,
        classroom_id: str | None = None, description: str | None = None, end_at: str | None = None, all_day: bool = False,
    ) -> dict[str, Any]:
        event_id = _uid()
        event = {
            "id": event_id, "institution_id": institution_id, "classroom_id": classroom_id, "title": title,
            "description": description, "start_at": start_at, "end_at": end_at, "all_day": all_day,
            "created_by": created_by, "created_at": _now(),
        }
        self.calendar_events[event_id] = event
        return event

    def list_events(self, institution_id: str) -> list[dict[str, Any]]:
        items = [e for e in self.calendar_events.values() if e["institution_id"] == institution_id]
        return sorted(items, key=lambda e: e["start_at"])

    def delete_event(self, institution_id: str, event_id: str) -> bool:
        event = self.calendar_events.get(event_id)
        if not event or event["institution_id"] != institution_id:
            return False
        del self.calendar_events[event_id]
        return True

    # ---------------------------------------------------------------- author display helper
    def author_name(self, user_id: str) -> str:
        user = self.users.get(user_id, {})
        return user.get("full_name") or user.get("email") or "—"
