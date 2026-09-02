from typing import Any, Protocol


class AuthProvider(Protocol):
    """Authentication boundary used by controllers and services."""

    @property
    def name(self) -> str: ...

    def verify_token(self, token: str) -> dict[str, Any]: ...
