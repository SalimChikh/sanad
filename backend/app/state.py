"""Process-wide singletons — one instance of each, imported by every router.

Mirrors Fidli's app/state.py: a single place that wires the auth provider,
the access controller and the data store, so nothing re-creates its own
copy per request.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import Header, HTTPException

from app.controllers.access import AccessController
from app.providers.auth.factory import create_auth_provider
from app.store import Store

auth_provider = create_auth_provider()
access_controller = AccessController(auth_provider)

# Real Postgres (Supabase) once DATABASE_URL is set, same in-memory Store as
# before otherwise — local dev, tests, or a Sanad deploy without a
# provisioned database yet. See app/database.py: same method surface as
# Store, so nothing above this line (routers included) has to change.
if os.getenv("DATABASE_URL", "").strip():
    from app.database import DatabaseStore
    store: Any = DatabaseStore()
else:
    store: Any = Store()


def _claims(authorization: str | None) -> dict[str, Any]:
    return access_controller.claims(authorization)


def _identity(authorization: str | None) -> dict[str, Any]:
    """Resolve the bearer token to a stable app_users row (creating it on
    first sight — same "just-in-time" identity pattern as Fidli)."""
    claims = _claims(authorization)
    return store.resolve_user(
        auth_provider.name if auth_provider else "demo",
        str(claims["sub"]),
        claims.get("email"),
    )


def _staff(authorization: str | None) -> dict[str, Any]:
    """Require the caller to be active staff at some institution."""
    user = _identity(authorization)
    membership = store.staff_membership(user["id"])
    if not membership:
        raise HTTPException(403, "Compte du personnel requis")
    return membership


def _owner(authorization: str | None) -> dict[str, Any]:
    member = _staff(authorization)
    if member["role"] != "owner":
        raise HTTPException(403, "Réservé au propriétaire de l'établissement")
    return member


def staff_can_access_child(membership: dict[str, Any], child: dict[str, Any]) -> bool:
    """An owner sees every child in their institution. An educator is
    scoped to the classes they were assigned (at invite time, or later via
    PATCH /staff/{user_id}/classrooms) — a child with no classroom at all
    is invisible to educators, only the owner can manage them until
    they're placed in a classroom."""
    if membership["institution_id"] != child["institution_id"]:
        return False
    if membership["role"] == "owner":
        return True
    return child["classroom_id"] in (membership.get("classroom_ids") or [])


def require_child_access(authorization: str | None, child_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """A caller may see a child's feed either as staff of that child's
    institution (subject to classroom scoping for an educator), or as a
    linked parent — never both checks skipped."""
    user = _identity(authorization)
    child = store.child(child_id)
    if not child:
        raise HTTPException(404, "Enfant introuvable")
    membership = store.staff_membership(user["id"])
    if membership and membership["institution_id"] == child["institution_id"]:
        if staff_can_access_child(membership, child):
            return user, child
        # Same institution, wrong classroom for this educator — 404 rather
        # than 403, consistent with every other classroom-scope check in
        # this router group (see children.py): doesn't confirm to an
        # educator that a specific child exists outside their classes.
        raise HTTPException(404, "Enfant introuvable")
    if store.is_parent_of(user["id"], child_id):
        return user, child
    raise HTTPException(403, "Accès refusé à cet enfant")
