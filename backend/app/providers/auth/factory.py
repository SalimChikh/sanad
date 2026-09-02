from __future__ import annotations

import os

from app.providers.auth.base import AuthProvider


def create_auth_provider() -> AuthProvider | None:
    """AUTH_PROVIDER=none (default until Firebase is configured) runs in
    demo mode — see app/controllers/access.py's "demo-owner-token" /
    "demo-parent-token" bypass, same pattern as Fidli."""
    provider = os.getenv("AUTH_PROVIDER", "none").strip().lower()
    if provider == "none":
        return None
    if provider == "firebase":
        from app.providers.auth.firebase import FirebaseAuthProvider

        return FirebaseAuthProvider()
    raise RuntimeError(f"AUTH_PROVIDER inconnu: {provider}")
