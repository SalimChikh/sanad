"""Regression test for a real production bug: switching AUTH_PROVIDER to
"firebase" made the demo bearer tokens resolve to a brand new, disconnected
identity instead of the one they'd always used — see app/state.py's
_identity() for the full story. Reproduced here by monkeypatching
app.state.auth_provider to look like Firebase is configured, then using a
demo token exactly as the demo bypass does.
"""
from app import state


def test_demo_token_identity_stays_under_the_demo_provider_even_with_a_real_auth_provider_configured(monkeypatch):
    class FakeFirebaseProvider:
        name = "firebase"

    monkeypatch.setattr(state, "auth_provider", FakeFirebaseProvider())

    before = state._identity("Bearer demo-owner-token")
    after = state._identity("Bearer demo-owner-token")

    assert before["id"] == after["id"]
    assert before["auth_provider"] == "demo"
