from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from ..auth import clear_admin_session_cookie, create_admin_session_token, read_admin_session, set_admin_session_cookie, validate_admin_credentials

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, response: Response) -> dict[str, Any]:
    username = payload.username.strip()
    if not validate_admin_credentials(username, payload.password):
        clear_admin_session_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_admin_session_token(username)
    set_admin_session_cookie(response, token)
    return {"ok": True, "username": username, "token": token}


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    clear_admin_session_cookie(response)
    return {"ok": True}


@router.get("/session")
def session(request: Request) -> dict[str, Any]:
    admin_session = read_admin_session(request)
    if not admin_session:
        return {"authenticated": False}
    return {"authenticated": True, "username": admin_session["u"], "expires_at": admin_session["exp"]}
