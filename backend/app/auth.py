from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import Request
from fastapi import Response
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / '.env.local', override=False)

ADMIN_COOKIE_NAME = os.getenv("ADMIN_COOKIE_NAME", "admin_auth")
ADMIN_SESSION_SECRET = os.getenv("ADMIN_SESSION_SECRET") or os.getenv("ADMIN_AUTH_SECRET", "local-dev-admin-secret")
ADMIN_SESSION_DURATION_SECONDS = int(os.getenv("ADMIN_SESSION_DURATION_SECONDS", str(60 * 60 * 10)))
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_COOKIE_SECURE = os.getenv("ADMIN_COOKIE_SECURE", "false").lower() == "true"
ADMIN_COOKIE_SAMESITE = os.getenv("ADMIN_COOKIE_SAMESITE", "none" if ADMIN_COOKIE_SECURE else "lax")


def _base64url_decode(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8")).decode("utf-8")


def _sign(payload: str) -> str:
    digest = hmac.new(ADMIN_SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def _base64url_encode(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("utf-8").rstrip("=")


def validate_admin_credentials(username: str, password: str) -> bool:
    return hmac.compare_digest(username.strip(), ADMIN_USERNAME) and hmac.compare_digest(password, ADMIN_PASSWORD)


def create_admin_session_token(username: str) -> str:
    payload = {
        "u": username.strip(),
        "exp": int(time.time() * 1000) + ADMIN_SESSION_DURATION_SECONDS * 1000,
    }
    encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":")))
    return f"{encoded_payload}.{_sign(encoded_payload)}"


def set_admin_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=ADMIN_COOKIE_NAME,
        value=token,
        max_age=ADMIN_SESSION_DURATION_SECONDS,
        httponly=True,
        secure=ADMIN_COOKIE_SECURE,
        samesite=ADMIN_COOKIE_SAMESITE,  # type: ignore[arg-type]
        path="/",
    )


def clear_admin_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=ADMIN_COOKIE_NAME,
        httponly=True,
        secure=ADMIN_COOKIE_SECURE,
        samesite=ADMIN_COOKIE_SAMESITE,  # type: ignore[arg-type]
        path="/",
    )


def read_admin_session(request: Request) -> dict[str, Any] | None:
    token = request.cookies.get(ADMIN_COOKIE_NAME)
    if not token or "." not in token:
      return None

    encoded_payload, signature = token.split(".", 1)
    expected_signature = _sign(encoded_payload)
    if not hmac.compare_digest(expected_signature, signature):
      return None

    try:
      payload = json.loads(_base64url_decode(encoded_payload))
    except Exception:
      return None

    if not payload.get("u") or not payload.get("exp") or int(payload["exp"]) < int(time.time() * 1000):
      return None
    return payload
