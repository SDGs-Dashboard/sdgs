from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..database import dump_json, execute


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_action(
    actor: str,
    action: str,
    entity_type: str,
    entity_id: str,
    *,
    old_value: Any = None,
    new_value: Any = None,
    source_file: str | None = None,
    source_evidence: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    execute(
        """
        INSERT INTO audit_log (
            actor, action, entity_type, entity_id, old_value, new_value,
            source_file, source_evidence, created_at, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            actor,
            action,
            entity_type,
            entity_id,
            None if old_value is None else str(old_value),
            None if new_value is None else str(new_value),
            source_file,
            source_evidence,
            utc_now(),
            dump_json(details or {}),
        ),
    )
