import struct
import zlib

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
OWNER = {"Authorization": "Bearer demo-owner-token"}


def _tiny_png() -> bytes:
    """A hand-built 1x1 white PNG — no test fixture image exists in this
    repo, and pulling in Pillow just to generate one isn't worth it."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    raw = b"\x00" + b"\xff\xff\xff"
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


def test_upload_rejects_unsupported_content_type():
    response = client.post(
        "/api/v1/uploads", headers=OWNER,
        files={"file": ("note.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 422


def test_upload_rejects_oversized_file():
    oversized = b"\x00" * (5 * 1024 * 1024 + 1)
    response = client.post(
        "/api/v1/uploads", headers=OWNER,
        files={"file": ("big.png", oversized, "image/png")},
    )
    assert response.status_code == 413


def test_upload_accepts_a_valid_png_and_serves_it_back():
    response = client.post(
        "/api/v1/uploads", headers=OWNER,
        files={"file": ("photo.png", _tiny_png(), "image/png")},
    )
    assert response.status_code == 201
    path = response.json()["path"]
    assert path.startswith("/uploads/")
    served = client.get(path)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"


def test_upload_requires_staff_authentication():
    response = client.post("/api/v1/uploads", files={"file": ("photo.png", _tiny_png(), "image/png")})
    assert response.status_code == 401
