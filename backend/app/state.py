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


def require_child_access(authorization: str | None, child_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """A caller may see a child's feed either as staff of that child's
    institution, or as a linked parent — never both checks skipped."""
    user = _identity(authorization)
    child = store.child(child_id)
    if not child:
        raise HTTPException(404, "Enfant introuvable")
    membership = store.staff_membership(user["id"])
    if membership and membership["institution_id"] == child["institution_id"]:
        return user, child
    if store.is_parent_of(user["id"], child_id):
        return user, child
    raise HTTPException(403, "Accès refusé à cet enfant")
