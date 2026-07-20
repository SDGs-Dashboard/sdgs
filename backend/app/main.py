from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .auth import read_admin_session
from .database import CONTROL_WORKBOOK_PATH, init_db, init_storage
from .routes import admin_data, approvals, exports, extraction, extraction_results, proposed_updates, reports, upload
from .schemas import ImportResponse
from .services.workbook_importer import copy_control_workbook, import_control_workbook, workbook_exists

app = FastAPI(title="NISR SDG Automation", version="0.1.0")


def cors_origins() -> list[str]:
    configured = os.getenv("BACKEND_CORS_ORIGINS", "").strip()
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "https://sdgs-dashboard.github.io",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_admin_auth(request: Request, call_next):
    if request.url.path in {"/api/health"}:
        return await call_next(request)

    if request.url.path.startswith("/api/"):
        if not read_admin_session(request):
            return JSONResponse({"error": "Authentication required."}, status_code=401)
    return await call_next(request)

app.include_router(upload.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(extraction.router, prefix="/api")
app.include_router(extraction_results.router, prefix="/api")
app.include_router(proposed_updates.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(admin_data.router, prefix="/api")


@app.on_event("startup")
def startup() -> None:
    init_storage()
    init_db()
    if workbook_exists():
        import_control_workbook(force=False)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/import-control-workbook", response_model=ImportResponse)
def import_control_workbook_endpoint(source_path: str | None = None, force: bool = False) -> ImportResponse:
    if source_path:
        copy_control_workbook(source_path)
    result = import_control_workbook(CONTROL_WORKBOOK_PATH, force=force)
    return ImportResponse(**result)
