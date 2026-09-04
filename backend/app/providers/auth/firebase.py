from __future__ import annotations

import base64
import json
import os
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials


def _credentials() -> credentials.Base:
    """ApplicationDefault() only works when the process itself runs on GCP
    (Cloud Run, like Fidli) — Sanad's backend runs on Render, which has no
    such metadata server, so it needs an explicit service account key
    instead. FIREBASE_SERVICE_ACCOUNT_B64 holds that key's JSON,
    base64-encoded (keeps it a single-line env var, safe to paste into
    Render's UI without worrying about newline/quoting mangling)."""
    encoded = os.getenv("FIREBASE_SERVICE_ACCOUNT_B64", "").strip()
    if encoded:
        info = json.loads(base64.b64decode(encoded))
        return credentials.Certificate(info)
    return credentials.ApplicationDefault()


class FirebaseAuthProvider:
    def __init__(self, project_id: str | None = None) -> None:
        self.project_id = project_id or os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID est requis avec AUTH_PROVIDER=firebase")
        try:
            self.app = firebase_admin.get_app("sanad-auth")
        except ValueError:
            self.app = firebase_admin.initialize_app(
                _credentials(),
                {"projectId": self.project_id},
                name="sanad-auth",
            )

    @property
    def name(self) -> str:
        return "firebase"

    def verify_token(self, token: str) -> dict[str, Any]:
        decoded = auth.verify_id_token(token, app=self.app, check_revoked=True)
        return {
            **decoded,
            "sub": decoded.get("uid") or decoded["sub"],
            "email": decoded.get("email", ""),
        }
