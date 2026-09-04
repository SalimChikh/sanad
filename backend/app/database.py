"""Postgres-backed store — the real implementation of the interface
`app/store.py`'s in-memory `Store` was designed to mirror from day one.

Same pattern as Fidli's `app/database.py`: a thin class around SQLAlchemy's
`Engine`, one method per `Store` method, raw SQL via `text()` against the
schema in `supabase/migrations/202609020001_init.sql`. Nothing here is an
ORM model — the shape of every row is a plain dict, same as `Store` already
returns, so swapping this in doesn't touch a single router.

Enabled only when `DATABASE_URL` is set; `app/state.py` falls back to the
in-memory `Store` otherwise (local dev, tests, or Sanad running without a
provisioned database yet).
"""
from __future__ import annotations

import os
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, RowMapping


def _normalize(url: str) -> str:
    """Supabase/Render hand out plain `postgres://` or `postgresql://` —
    SQLAlchemy needs the driver named explicitly to pick psycopg3 (the
    driver actually installed here) instead of defaulting to psycopg2."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _json(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json(item) for item in value]
    return value


def _dict(row: RowMapping | None) -> dict[str, Any] | None:
    return _json(dict(row)) if row else None


def _list(rows: Any) -> list[dict[str, Any]]:
    return [_dict(row) for row in rows]


class DatabaseStore:
    def __init__(self) -> None:
        url = os.getenv("DATABASE_URL", "").strip()
        self.engine: Engine | None = create_engine(_normalize(url), pool_pre_ping=True, pool_size=5, max_overflow=5) if url else None

    @property
    def enabled(self) -> bool:
        return self.engine is not None

    def health(self) -> bool:
        if not self.engine:
            return False
        with self.engine.begin() as connection:
            return connection.execute(text("select 1")).scalar_one() == 1

    # ---------------------------------------------------------------- identity
    def resolve_user(self, auth_provider: str, auth_subject: str, email: str | None, full_name: str | None = None) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into app_users(auth_provider, auth_subject, email, full_name)
                values (:provider, :subject, lower(:email), :full_name)
                on conflict (auth_provider, auth_subject) do update
                  set email = coalesce(excluded.email, app_users.email),
                      full_name = coalesce(excluded.full_name, app_users.full_name),
                      updated_at = now()
                returning id, auth_provider, auth_subject, email, full_name, created_at
            """), {"provider": auth_provider, "subject": auth_subject, "email": email, "full_name": full_name}).mappings().one()
        return _dict(row) or {}

    # ---------------------------------------------------------------- staff / institution
    def staff_membership(self, user_id: str) -> dict[str, Any] | None:
        assert self.engine
        with self.engine.connect() as connection:
            row = connection.execute(text("""
                select su.user_id, su.role, i.id institution_id, i.name institution_name,
                       i.type institution_type, i.slug, i.status, i.primary_color, i.logo_url,
                       coalesce(array_agg(sc.classroom_id) filter (where sc.classroom_id is not null), '{}') as classroom_ids
                from staff_users su
                join institutions i on i.id = su.institution_id
                left join staff_classrooms sc on sc.user_id = su.user_id and sc.institution_id = su.institution_id
                where su.user_id = :user and su.active
                group by su.user_id, su.role, i.id, i.name, i.type, i.slug, i.status, i.primary_color, i.logo_url
                limit 1
            """), {"user": user_id}).mappings().first()
        if not row:
            return None
        return {"kind": "staff", **_dict(row)}  # type: ignore[misc]

    def bootstrap_institution(self, user_id: str, name: str, type_: str) -> dict[str, Any]:
        existing = self.staff_membership(user_id)
        if existing:
            return existing
        assert self.engine
        with self.engine.begin() as connection:
            institution = connection.execute(text("""
                insert into institutions(name, slug, type)
                values (:name, :slug, :type)
                returning id
            """), {"name": name, "slug": self._slugify(name), "type": type_}).mappings().one()
            connection.execute(text("""
                insert into staff_users(user_id, institution_id, role) values (:user, :institution, 'owner')
            """), {"user": user_id, "institution": institution["id"]})
        return self.staff_membership(user_id)  # type: ignore[return-value]

    @staticmethod
    def _slugify(name: str) -> str:
        import re
        base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "etablissement"
        return f"{base}-{secrets.token_hex(3)}"

    def institution_staff(self, institution_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select su.user_id, su.institution_id, su.role, su.active, su.created_at, au.email, au.full_name,
                       coalesce(array_agg(sc.classroom_id) filter (where sc.classroom_id is not null), '{}') as classroom_ids
                from staff_users su
                join app_users au on au.id = su.user_id
                left join staff_classrooms sc on sc.user_id = su.user_id and sc.institution_id = su.institution_id
                where su.institution_id = :institution
                group by su.user_id, su.institution_id, su.role, su.active, su.created_at, au.email, au.full_name
            """), {"institution": institution_id}).mappings()
            return _list(rows)

    def update_staff_classrooms(self, institution_id: str, user_id: str, classroom_ids: list[str]) -> bool:
        assert self.engine
        with self.engine.begin() as connection:
            exists = connection.execute(text("""
                select 1 from staff_users where user_id = :user and institution_id = :institution and active
            """), {"user": user_id, "institution": institution_id}).first()
            if not exists:
                return False
            connection.execute(text("""
                delete from staff_classrooms where user_id = :user and institution_id = :institution
            """), {"user": user_id, "institution": institution_id})
            for classroom_id in classroom_ids:
                connection.execute(text("""
                    insert into staff_classrooms(user_id, institution_id, classroom_id)
                    values (:user, :institution, :classroom)
                """), {"user": user_id, "institution": institution_id, "classroom": classroom_id})
        return True

    def create_staff_invite(self, institution_id: str, email: str, role: str, created_by: str, classroom_ids: list[str] | None = None) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into staff_invites(institution_id, email, role, token, created_by, expires_at, classroom_ids)
                values (:institution, lower(:email), :role, :token, :created_by, :expires_at, :classroom_ids)
                returning id, institution_id, email, role, token, created_by, created_at, expires_at, accepted_at, classroom_ids
            """), {
                "institution": institution_id, "email": email.strip(), "role": role,
                "token": secrets.token_urlsafe(24), "created_by": created_by,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                "classroom_ids": classroom_ids or [],
            }).mappings().one()
        return _dict(row) or {}

    def list_staff_invites(self, institution_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select * from staff_invites where institution_id = :institution and accepted_at is null
            """), {"institution": institution_id}).mappings()
            return _list(rows)

    def cancel_staff_invite(self, institution_id: str, invite_id: str) -> bool:
        assert self.engine
        with self.engine.begin() as connection:
            result = connection.execute(text("""
                delete from staff_invites where id = :id and institution_id = :institution
            """), {"id": invite_id, "institution": institution_id})
        return result.rowcount > 0

    def accept_staff_invite(self, token: str, user_id: str) -> dict[str, Any] | None:
        assert self.engine
        with self.engine.begin() as connection:
            invite = connection.execute(text("""
                update staff_invites set accepted_at = now()
                where token = :token and accepted_at is null
                returning institution_id, role, classroom_ids
            """), {"token": token}).mappings().first()
            if not invite:
                return None
            connection.execute(text("""
                insert into staff_users(user_id, institution_id, role) values (:user, :institution, :role)
                on conflict (user_id, institution_id) do update set role = excluded.role, active = true
            """), {"user": user_id, "institution": invite["institution_id"], "role": invite["role"]})
            for classroom_id in invite["classroom_ids"] or []:
                connection.execute(text("""
                    insert into staff_classrooms(user_id, institution_id, classroom_id)
                    values (:user, :institution, :classroom)
                    on conflict do nothing
                """), {"user": user_id, "institution": invite["institution_id"], "classroom": classroom_id})
        return self.staff_membership(user_id)

    # ---------------------------------------------------------------- classrooms
    def create_classroom(self, institution_id: str, name: str, age_group: str | None) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into classrooms(institution_id, name, age_group)
                values (:institution, :name, :age_group)
                returning id, institution_id, name, age_group, created_at
            """), {"institution": institution_id, "name": name, "age_group": age_group}).mappings().one()
        return _dict(row) or {}

    def list_classrooms(self, institution_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select * from classrooms where institution_id = :institution order by name
            """), {"institution": institution_id}).mappings()
            return _list(rows)

    # ---------------------------------------------------------------- children
    def create_child(self, institution_id: str, first_name: str, last_name: str, birth_date: str | None, classroom_id: str | None) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into children(institution_id, classroom_id, first_name, last_name, birth_date)
                values (:institution, :classroom, :first_name, :last_name, :birth_date)
                returning *
            """), {
                "institution": institution_id, "classroom": classroom_id,
                "first_name": first_name, "last_name": last_name, "birth_date": birth_date,
            }).mappings().one()
        return _dict(row) or {}

    def list_children(self, institution_id: str, classroom_id: str | None = None, include_inactive: bool = False) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            # Cast the parameter explicitly: passed as NULL when no filter is
            # requested, Postgres can't infer it's a uuid to compare against
            # classroom_id (pgbouncer's session pooler surfaces this as
            # "AmbiguousParameter" — a plain direct connection tends to
            # infer it from context and hide the same underlying issue).
            rows = connection.execute(text("""
                select * from children where institution_id = :institution and (:include_inactive or active)
                  and (cast(:classroom as uuid) is null or classroom_id = cast(:classroom as uuid))
                order by first_name
            """), {"institution": institution_id, "classroom": classroom_id, "include_inactive": include_inactive}).mappings()
            return _list(rows)

    def child(self, child_id: str) -> dict[str, Any] | None:
        assert self.engine
        with self.engine.connect() as connection:
            row = connection.execute(text("select * from children where id = :id"), {"id": child_id}).mappings().first()
        return _dict(row)

    def update_child(self, child_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        assert self.engine
        if not patch:
            return self.child(child_id)
        columns = ", ".join(f"{key} = :{key}" for key in patch)
        with self.engine.begin() as connection:
            row = connection.execute(text(f"""
                update children set {columns}, updated_at = now() where id = :id returning *
            """), {**patch, "id": child_id}).mappings().first()
        return _dict(row)

    # ---------------------------------------------------------------- parents
    def create_parent_invite(self, institution_id: str, child_id: str, email: str, relationship: str, created_by: str) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into parent_invites(institution_id, child_id, email, relationship, token, created_by, expires_at)
                values (:institution, :child, lower(:email), :relationship, :token, :created_by, :expires_at)
                returning *
            """), {
                "institution": institution_id, "child": child_id, "email": email.strip(),
                "relationship": relationship, "token": secrets.token_urlsafe(24), "created_by": created_by,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=14),
            }).mappings().one()
        return _dict(row) or {}

    def list_parent_invites(self, child_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select * from parent_invites where child_id = :child and accepted_at is null
            """), {"child": child_id}).mappings()
            return _list(rows)

    def accept_parent_invite(self, token: str, user_id: str) -> dict[str, Any] | None:
        assert self.engine
        with self.engine.begin() as connection:
            invite = connection.execute(text("""
                update parent_invites set accepted_at = now()
                where token = :token and accepted_at is null
                returning child_id, relationship
            """), {"token": token}).mappings().first()
            if not invite:
                return None
            connection.execute(text("""
                insert into parent_links(child_id, parent_user_id, relationship)
                values (:child, :user, :relationship)
                on conflict (child_id, parent_user_id) do nothing
            """), {"child": invite["child_id"], "user": user_id, "relationship": invite["relationship"]})
        return self.child(invite["child_id"])

    def parent_children(self, user_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select c.* from children c join parent_links pl on pl.child_id = c.id
                where pl.parent_user_id = :user
            """), {"user": user_id}).mappings()
            return _list(rows)

    def is_parent_of(self, user_id: str, child_id: str) -> bool:
        assert self.engine
        with self.engine.connect() as connection:
            row = connection.execute(text("""
                select 1 from parent_links where parent_user_id = :user and child_id = :child
            """), {"user": user_id, "child": child_id}).first()
        return row is not None

    # ---------------------------------------------------------------- feed
    def create_post(
        self, institution_id: str, author_user_id: str, type_: str, *,
        child_id: str | None = None, classroom_id: str | None = None,
        caption: str | None = None, media_url: str | None = None, meal_status: str | None = None,
    ) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into posts(institution_id, child_id, classroom_id, author_user_id, type, caption, media_url, meal_status)
                values (:institution, :child, :classroom, :author, :type, :caption, :media_url, :meal_status)
                returning *
            """), {
                "institution": institution_id, "child": child_id, "classroom": classroom_id,
                "author": author_user_id, "type": type_, "caption": caption,
                "media_url": media_url, "meal_status": meal_status,
            }).mappings().one()
        return _dict(row) or {}

    def feed_for_child(self, child_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select * from posts where child_id = :child order by created_at desc
            """), {"child": child_id}).mappings()
            return _list(rows)

    def feed_for_institution(self, institution_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select * from posts where institution_id = :institution and child_id is null order by created_at desc
            """), {"institution": institution_id}).mappings()
            return _list(rows)

    def post(self, post_id: str) -> dict[str, Any] | None:
        assert self.engine
        with self.engine.connect() as connection:
            row = connection.execute(text("select * from posts where id = :id"), {"id": post_id}).mappings().first()
        return _dict(row)

    def delete_post(self, post_id: str) -> bool:
        assert self.engine
        with self.engine.begin() as connection:
            result = connection.execute(text("delete from posts where id = :id"), {"id": post_id})
        return result.rowcount > 0

    # ---------------------------------------------------------------- comments
    def add_comment(self, post_id: str, author_user_id: str, body: str) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into comments(post_id, author_user_id, body) values (:post, :author, :body) returning *
            """), {"post": post_id, "author": author_user_id, "body": body}).mappings().one()
        return _dict(row) or {}

    def comments_for_post(self, post_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select * from comments where post_id = :post order by created_at
            """), {"post": post_id}).mappings()
            return _list(rows)

    # ---------------------------------------------------------------- calendar
    def create_event(
        self, institution_id: str, created_by: str, title: str, start_at: str, *,
        classroom_id: str | None = None, description: str | None = None, end_at: str | None = None, all_day: bool = False,
    ) -> dict[str, Any]:
        assert self.engine
        with self.engine.begin() as connection:
            row = connection.execute(text("""
                insert into calendar_events(institution_id, classroom_id, title, description, start_at, end_at, all_day, created_by)
                values (:institution, :classroom, :title, :description, :start_at, :end_at, :all_day, :created_by)
                returning *
            """), {
                "institution": institution_id, "classroom": classroom_id, "title": title,
                "description": description, "start_at": start_at, "end_at": end_at,
                "all_day": all_day, "created_by": created_by,
            }).mappings().one()
        return _dict(row) or {}

    def list_events(self, institution_id: str) -> list[dict[str, Any]]:
        assert self.engine
        with self.engine.connect() as connection:
            rows = connection.execute(text("""
                select * from calendar_events where institution_id = :institution order by start_at
            """), {"institution": institution_id}).mappings()
            return _list(rows)

    def delete_event(self, institution_id: str, event_id: str) -> bool:
        assert self.engine
        with self.engine.begin() as connection:
            result = connection.execute(text("""
                delete from calendar_events where id = :id and institution_id = :institution
            """), {"id": event_id, "institution": institution_id})
        return result.rowcount > 0

    # ---------------------------------------------------------------- author display helper
    def author_name(self, user_id: str) -> str:
        assert self.engine
        with self.engine.connect() as connection:
            row = connection.execute(text("""
                select full_name, email from app_users where id = :id
            """), {"id": user_id}).mappings().first()
        if not row:
            return "—"
        return row["full_name"] or row["email"] or "—"
