from __future__ import annotations

import sys
from pathlib import Path

from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import create_admin_session_token, read_admin_session


def test_admin_session_accepts_bearer_token() -> None:
    token = create_admin_session_token("admin")
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/reports",
            "headers": [(b"authorization", f"Bearer {token}".encode("utf-8"))],
        }
    )

    session = read_admin_session(request)

    assert session is not None
    assert session["u"] == "admin"


def test_admin_session_rejects_invalid_bearer_token() -> None:
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/reports",
            "headers": [(b"authorization", b"Bearer invalid.token")],
        }
    )

    assert read_admin_session(request) is None
