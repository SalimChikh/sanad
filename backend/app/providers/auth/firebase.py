from __future__ import annotations

import os
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials


class FirebaseAuthProvider:
    def __init__(self, project_id: str | None = None) -> None:
        self.project_id = project_id or os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID est requis avec AUTH_PROVIDER=firebase")
        try:
            self.app = firebase_admin.get_app("sanad-auth")
        except ValueError:
            self.app = firebase_admin.initialize_app(
                credentials.ApplicationDefault(),
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
