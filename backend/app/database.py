import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Sequence

from dotenv import load_dotenv

from .models import SCHEMA_SQL

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
EXPORTS_DIR = DATA_DIR / "exports"
DB_PATH = DATA_DIR / "nisr_sdg.db"
CONTROL_WORKBOOK_PATH = DATA_DIR / "NISR_SDG_Automation_Mapping_Built.xlsx"

load_dotenv(BASE_DIR / ".env.local")
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "backend" / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - only needed when DATABASE_URL uses Postgres.
    psycopg = None
    dict_row = None


def init_storage() -> None:
    for directory in (DATA_DIR, UPLOADS_DIR, PROCESSED_DIR, EXPORTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def is_postgres() -> bool:
    return DATABASE_URL.startswith(("postgresql://", "postgres://"))


def database_engine() -> str:
    return "postgres" if is_postgres() else "sqlite"


def _postgres_url() -> str:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required when using Postgres.")
    if DATABASE_URL.startswith("postgres://"):
        return DATABASE_URL.replace("postgres://", "postgresql://", 1)
    return DATABASE_URL


def _split_sql_script(script: str) -> list[str]:
    return [statement.strip() for statement in script.split(";") if statement.strip()]


def _postgres_schema_sql(script: str) -> str:
    statements = []
    for statement in _split_sql_script(script):
        if statement.upper().startswith("PRAGMA "):
            continue
        statements.append(statement.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY"))
    return ";\n\n".join(statements)


def _postgres_query(query: str, *, returning_id: bool = False) -> tuple[str, bool]:
    sql = query.replace("?", "%s").strip()
    upper_sql = sql.upper()
    returning_added = False
    if returning_id and upper_sql.startswith("INSERT ") and " RETURNING " not in upper_sql:
        sql = f"{sql.rstrip(';')} RETURNING id"
        returning_added = True
    return sql, returning_added


class PostgresCursor:
    def __init__(self, cursor: Any):
        self._cursor = cursor
        self.lastrowid = 0

    def execute(self, query: str, params: Sequence[Any] = (), *, returning_id: bool = False) -> "PostgresCursor":
        sql, returning_added = _postgres_query(query, returning_id=returning_id)
        self._cursor.execute(sql, params)
        if returning_added:
            row = self._cursor.fetchone()
            self.lastrowid = int(row["id"]) if row and row.get("id") is not None else 0
        return self

    def executemany(self, query: str, rows: Iterable[Sequence[Any]]) -> None:
        sql, _ = _postgres_query(query)
        self._cursor.executemany(sql, rows)

    def executescript(self, script: str) -> None:
        for statement in _split_sql_script(_postgres_schema_sql(script)):
            self.execute(statement)

    def fetchone(self) -> dict[str, Any] | None:
        return self._cursor.fetchone()

    def fetchall(self) -> list[dict[str, Any]]:
        return self._cursor.fetchall()


class PostgresConnection:
    def __init__(self) -> None:
        if psycopg is None or dict_row is None:
            raise RuntimeError("Install backend dependency 'psycopg[binary]' before using DATABASE_URL.")
        self._connection = psycopg.connect(_postgres_url(), row_factory=dict_row)

    def __enter__(self) -> "PostgresConnection":
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        if exc_type:
            self._connection.rollback()
        else:
            self._connection.commit()
        self._connection.close()

    def cursor(self) -> PostgresCursor:
        return PostgresCursor(self._connection.cursor())

    def execute(self, query: str, params: Sequence[Any] = ()) -> PostgresCursor:
        return self.cursor().execute(query, params, returning_id=True)

    def executemany(self, query: str, rows: Iterable[Sequence[Any]]) -> None:
        self.cursor().executemany(query, rows)

    def commit(self) -> None:
        self._connection.commit()


def get_connection() -> sqlite3.Connection | PostgresConnection:
    init_storage()
    if is_postgres():
        return PostgresConnection()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with get_connection() as connection:
        if is_postgres():
            for statement in _split_sql_script(_postgres_schema_sql(SCHEMA_SQL)):
                connection.execute(statement)
        else:
            connection.executescript(SCHEMA_SQL)  # type: ignore[union-attr]


def row_to_dict(row: sqlite3.Row | dict[str, Any] | None) -> dict[str, Any] | None:
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
