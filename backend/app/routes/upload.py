from __future__ import annotations

"""Report upload route.

Stores uploaded PDF/Excel/CSV files and registers report metadata before any
extraction is attempted.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile

from ..database import UPLOADS_DIR, execute, fetch_one
from ..schemas import UploadResponse
from ..services.audit import log_action
from ..services.report_family import infer_report_family

router = APIRouter(prefix="/upload", tags=["upload"])


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def detect_report_type(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix in {".xlsx", ".xls", ".csv"}:
        return "excel"
    if suffix == ".pdf":
        return "pdf"
    return "unknown"


@router.post("", response_model=UploadResponse)
async def upload_report(
    file: UploadFile = File(...),
    report_name: str = Form(""),
    report_family: str = Form(""),
    source_institution: str = Form("NISR"),
    publication_year: int | None = Form(default=None),
    owner: str = Form("staff"),
) -> UploadResponse:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stored_name = f"{timestamp}_{file.filename}"
    stored_path = UPLOADS_DIR / stored_name
    stored_path.write_bytes(content)

    report_id = f"REP-UP-{timestamp}"
    detected_family = infer_report_family(report_family, report_name, file.filename)
    execute(
        """
        INSERT INTO reports (
            report_id, report_name, report_family, report_type, source_institution,
            publication_year, file_path, original_file_name, upload_date, status,
            extraction_summary, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            report_id,
            report_name or Path(file.filename).stem,
            detected_family or report_family or None,
            detect_report_type(file.filename),
            source_institution or "NISR",
            publication_year,
            str(stored_path),
            file.filename,
            utc_now(),
            "Uploaded",
            None,
            json.dumps({"owner": owner}),
        ),
    )
    log_action(
        owner,
        "report_uploaded",
        "report",
        report_id,
        source_file=file.filename,
        details={"path": str(stored_path)},
    )
    report = fetch_one("SELECT * FROM reports WHERE report_id = ?", (report_id,))
    return UploadResponse(report=report)  # type: ignore[arg-type]
