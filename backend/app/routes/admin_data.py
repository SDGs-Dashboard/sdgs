from __future__ import annotations

from fastapi import APIRouter

from ..database import fetch_all
from ..schemas import AuditLogEntry, VersionHistoryEntry

router = APIRouter(tags=["admin-data"])


@router.get("/approved-updates")
def list_approved_updates() -> list[dict]:
    return fetch_all("SELECT * FROM approved_updates ORDER BY approved_at DESC, id DESC")


@router.get("/audit-log", response_model=list[AuditLogEntry])
def list_audit_log() -> list[AuditLogEntry]:
    return [AuditLogEntry(**row) for row in fetch_all("SELECT * FROM audit_log ORDER BY created_at DESC, id DESC")]


@router.get("/version-history", response_model=list[VersionHistoryEntry])
def list_version_history() -> list[VersionHistoryEntry]:
    rows = fetch_all("SELECT * FROM sdg_data_version_history ORDER BY created_at DESC, id DESC")
    return [VersionHistoryEntry(**row) for row in rows]
