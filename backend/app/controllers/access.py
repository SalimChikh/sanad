from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException

from app.providers.auth.base import AuthProvider


class AccessController:
    """Translate provider identities into Sanad claims.

    Unlike Fidli (one merchant per owner, staff always scoped to it), a
    single person here can plausibly be *both* an educator at one
    institution and a parent at another (or the same one) — so `claims()`
    only resolves identity, never role. Callers (routers) decide whether
    they need a staff membership, a parent link, or either.
    """

    def __init__(self, auth: AuthProvider | None) -> None:
        self.auth = auth

    def claims(self, authorization: str | None) -> dict[str, Any]:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Session requise")
        token = authorization.removeprefix("Bearer ").strip()
        demo_enabled = os.getenv("ALLOW_DEMO_AUTH", "true").lower() == "true"
        if demo_enabled and token == "demo-owner-token":
            return {"sub": "00000000-0000-0000-0000-000000000001", "email": "owner@sanad.app", "demo": True}
        if demo_enabled and token == "demo-parent-token":
            return {"sub": "00000000-0000-0000-0000-000000000002", "email": "parent@sanad.app", "demo": True}
        if demo_enabled and token == "demo-educator-token":
            return {"sub": "00000000-0000-0000-0000-000000000003", "email": "educator@sanad.app", "demo": True}
        if not self.auth:
            raise HTTPException(401, "Le fournisseur d'authentification n'est pas configuré")
        try:
            return self.auth.verify_token(token)
        except Exception as error:
            raise HTTPException(401, "Session invalide ou expirée") from error
