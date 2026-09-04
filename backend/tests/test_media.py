"""Unit tests for app/media.py's storage fallback — module-level
SUPABASE_URL/SUPABASE_SERVICE_KEY are read once at import, so these check
the pure logic (storage_enabled, extension mapping) rather than re-import
the module with different env vars (covered end-to-end manually against a
real Supabase project instead — see the "Déployé" section of the README).
"""
from app import media


def test_storage_disabled_without_supabase_env(monkeypatch):
    monkeypatch.setattr(media, "SUPABASE_URL", "")
    monkeypatch.setattr(media, "SUPABASE_SERVICE_KEY", "")
    assert media.storage_enabled() is False


def test_storage_enabled_with_both_env_vars(monkeypatch):
    monkeypatch.setattr(media, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(media, "SUPABASE_SERVICE_KEY", "secret")
    assert media.storage_enabled() is True


def test_storage_disabled_when_only_url_is_set(monkeypatch):
    monkeypatch.setattr(media, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(media, "SUPABASE_SERVICE_KEY", "")
    assert media.storage_enabled() is False


def test_save_upload_falls_back_to_local_disk_without_supabase_env(monkeypatch):
    monkeypatch.setattr(media, "SUPABASE_URL", "")
    monkeypatch.setattr(media, "SUPABASE_SERVICE_KEY", "")
    path = media.save_upload(b"fake-image-bytes", "image/png")
    try:
        assert path.startswith("/uploads/")
        assert (media.UPLOAD_DIR / path.removeprefix("/uploads/")).exists()
    finally:
        (media.UPLOAD_DIR / path.removeprefix("/uploads/")).unlink(missing_ok=True)
