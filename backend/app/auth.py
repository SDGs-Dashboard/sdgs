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
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / '.env.local', override=False)

ADMIN_COOKIE_NAME = os.getenv("ADMIN_COOKIE_NAME", "admin_auth")
ADMIN_SESSION_SECRET = os.getenv("ADMIN_SESSION_SECRET", "local-dev-admin-secret")


def _base64url_decode(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8")).decode("utf-8")


def _sign(payload: str) -> str:
    digest = hmac.new(ADMIN_SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


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
