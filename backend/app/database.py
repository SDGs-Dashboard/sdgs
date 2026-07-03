import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Sequence

from .models import SCHEMA_SQL

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
EXPORTS_DIR = DATA_DIR / "exports"
DB_PATH = DATA_DIR / "nisr_sdg.db"
CONTROL_WORKBOOK_PATH = DATA_DIR / "NISR_SDG_Automation_Mapping_Built.xlsx"


def init_storage() -> None:
    for directory in (DATA_DIR, UPLOADS_DIR, PROCESSED_DIR, EXPORTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    init_storage()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(SCHEMA_SQL)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def fetch_one(query: str, params: Sequence[Any] = ()) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(query, params).fetchone()
    return row_to_dict(row)


def fetch_all(query: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def execute(query: str, params: Sequence[Any] = ()) -> int:
    with get_connection() as connection:
        cursor = connection.execute(query, params)
        connection.commit()
        return int(cursor.lastrowid or 0)


def execute_many(query: str, rows: Iterable[Sequence[Any]]) -> None:
    with get_connection() as connection:
        connection.executemany(query, rows)
        connection.commit()


def table_count(table_name: str) -> int:
    record = fetch_one(f"SELECT COUNT(*) AS total FROM {table_name}")
    return int(record["total"]) if record else 0


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
