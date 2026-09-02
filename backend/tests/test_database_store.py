"""Unit tests for app/database.py that don't need a real Postgres connection:
DatabaseStore lazily builds a SQLAlchemy Engine in __init__ but never
connects until a query actually runs, so URL normalization and the
`enabled` flag are testable in isolation.
"""
from app.database import DatabaseStore, _normalize


def test_normalize_rewrites_bare_postgres_scheme_to_psycopg3():
    assert _normalize("postgres://user:pw@host:5432/db") == "postgresql+psycopg://user:pw@host:5432/db"


def test_normalize_rewrites_plain_postgresql_scheme_to_psycopg3():
    assert _normalize("postgresql://user:pw@host:5432/db") == "postgresql+psycopg://user:pw@host:5432/db"


def test_normalize_leaves_an_already_explicit_driver_untouched():
    url = "postgresql+psycopg://user:pw@host:5432/db"
    assert _normalize(url) == url


def test_disabled_without_a_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert DatabaseStore().enabled is False


def test_enabled_with_a_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@host:5432/db")
    assert DatabaseStore().enabled is True
