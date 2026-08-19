from __future__ import annotations

"""Report-deletion helpers for the NISR automation backend.

Deleting a report removes its uploaded file and workflow artifacts, while the
audit log entry for the deletion is preserved.
"""

from pathlib import Path
from typing import Any

from ..database import fetch_one, get_connection
from .audit import log_action


def delete_report(report_id: str, deleted_by: str = "admin") -> dict[str, Any]:
    report = fetch_one("SELECT * FROM reports WHERE report_id = ?", (report_id,))
    if not report:
        raise ValueError("Report not found.")

    report_name = str(report.get("report_name") or "").strip()
    file_path = Path(str(report.get("file_path") or "").strip()) if report.get("file_path") else None

    with get_connection() as connection:
        extracted_table_count = int(
            connection.execute("SELECT COUNT(*) AS total FROM extracted_tables WHERE report_id = ?", (report_id,)).fetchone()["total"]
        )
        extraction_result_count = int(
            connection.execute("SELECT COUNT(*) AS total FROM extraction_results WHERE report_id = ?", (report_id,)).fetchone()["total"]
        )
        proposed_update_count = int(
            connection.execute("SELECT COUNT(*) AS total FROM proposed_updates WHERE source_report_id = ?", (report_id,)).fetchone()["total"]
        )
        approved_update_count = int(
            connection.execute("SELECT COUNT(*) AS total FROM approved_updates WHERE source_report = ?", (report_name,)).fetchone()["total"]
        )
        version_history_count = int(
            connection.execute("SELECT COUNT(*) AS total FROM sdg_data_version_history WHERE source_report = ?", (report_name,)).fetchone()["total"]
        )

        connection.execute("DELETE FROM reports WHERE report_id = ?", (report_id,))
        connection.execute("DELETE FROM approved_updates WHERE source_report = ?", (report_name,))
        connection.execute("DELETE FROM sdg_data_version_history WHERE source_report = ?", (report_name,))

    if file_path and file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass

    log_action(
        deleted_by,
        "report_deleted",
        "report",
        report_id,
        source_file=str(report.get("original_file_name") or ""),
        details={
            "report_name": report_name,
            "removed_extracted_table_count": extracted_table_count,
            "removed_extraction_result_count": extraction_result_count,
            "removed_proposed_update_count": proposed_update_count,
            "removed_approved_update_count": approved_update_count,
            "removed_version_history_count": version_history_count,
        },
    )

    return {
        "deleted_report_id": report_id,
        "report_name": report_name,
        "removed_extracted_table_count": extracted_table_count,
        "removed_extraction_result_count": extraction_result_count,
        "removed_proposed_update_count": proposed_update_count,
        "removed_approved_update_count": approved_update_count,
        "removed_version_history_count": version_history_count,
    }
