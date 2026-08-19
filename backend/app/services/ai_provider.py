from __future__ import annotations

"""Optional AI-assist provider for ambiguous extraction candidates.

AI can only choose between candidates already found by deterministic extraction.
It never approves data; low-confidence choices stay in manual review.
"""

from dataclasses import dataclass
import json
import os
from typing import Any
import urllib.error
import urllib.request


OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_DEFAULT_MODEL = "openai/gpt-oss-20b:free"


@dataclass(frozen=True)
class CandidateDecision:
    selected_index: int | None
    confidence_score: float
    status: str
    reason: str
    provider: str = "openrouter"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _csv_env(name: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, "").split(",") if item.strip()]


def openrouter_enabled() -> bool:
    provider = os.getenv("AI_PROVIDER", "auto").strip().lower()
    return provider in {"auto", "openrouter"} and bool(os.getenv("OPENROUTER_API_KEY", "").strip())


def ai_assist_status() -> str:
    provider = os.getenv("AI_PROVIDER", "auto").strip().lower()
    if provider not in {"auto", "openrouter"}:
        return f"AI assist disabled because AI_PROVIDER is `{provider or 'blank'}`."
    if not os.getenv("OPENROUTER_API_KEY", "").strip():
        return "OpenRouter AI assist is not configured; set OPENROUTER_API_KEY on the backend."
    return "OpenRouter AI assist is enabled."


def _json_schema() -> dict[str, Any]:
    return {
        "name": "nisr_extraction_candidate_decision",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "selected_index": {
                    "type": ["integer", "null"],
                    "description": "Zero-based index of the best provided candidate, or null if none is safe.",
                },
                "confidence_score": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                },
                "status": {
                    "type": "string",
                    "enum": ["use_candidate", "needs_review", "no_match"],
                },
                "reason": {
                    "type": "string",
                },
            },
            "required": ["selected_index", "confidence_score", "status", "reason"],
            "additionalProperties": False,
        },
    }


def _safe_mapping_payload(mapping: dict[str, Any]) -> dict[str, Any]:
    fields = [
        "mapping_id",
        "indicator",
        "series_code",
        "unit_code",
        "status",
        "mapping_type",
        "report_name",
        "report_family",
        "data_source",
        "table_no",
        "table_title",
        "row_label",
        "column_label",
        "sheet_or_page",
        "source_table_reference",
        "source_or_survey_period",
        "publication_year",
        "dashboard_display_year",
        "calculation_or_transformation_rule",
        "required_nisr_review_action",
    ]
    return {field: mapping.get(field) for field in fields if mapping.get(field) not in (None, "")}


def _safe_report_payload(report: dict[str, Any]) -> dict[str, Any]:
    fields = ["report_id", "report_name", "report_family", "report_type", "publication_year", "source_institution"]
    return {field: report.get(field) for field in fields if report.get(field) not in (None, "")}


def _truncate(value: Any, limit: int = 700) -> Any:
    if isinstance(value, str):
        return value[:limit]
    if isinstance(value, dict):
        return {key: _truncate(item, limit) for key, item in value.items()}
    if isinstance(value, list):
        return [_truncate(item, limit) for item in value[:8]]
    return value


def _extract_json(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end < start:
            return None
        try:
            payload = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            return None
    return payload if isinstance(payload, dict) else None


def _request_payload(
    *,
    task: str,
    mapping: dict[str, Any],
    report: dict[str, Any],
    expected: dict[str, Any],
    candidates: list[dict[str, Any]],
    strict_schema: bool = True,
) -> dict[str, Any]:
    primary_model = os.getenv("OPENROUTER_MODEL", OPENROUTER_DEFAULT_MODEL).strip() or OPENROUTER_DEFAULT_MODEL
    models = [primary_model, *_csv_env("OPENROUTER_MODEL_FALLBACKS")][:3]
    body: dict[str, Any] = {
        "models": models,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a cautious NISR SDG extraction reviewer. Choose only from the provided candidates. "
                    "Do not invent values, years, locations, indicators, or source evidence. If the evidence is weak, "
                    "return selected_index as null and status needs_review or no_match. Staff approval remains mandatory. "
                    "Return JSON only with selected_index, confidence_score, status, and reason."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "task": task,
                        "priority_rules": [
                            "Prefer exact table or sheet evidence.",
                            "source_table_reference, table_no, and table_title are valid alternate source aliases for the same dashboard observation.",
                            "Do not reject a candidate only because it matches source_table_reference instead of table_no.",
                            "Then prefer exact row and column/year evidence.",
                            "Cleaned text and fuzzy text can only support Needs Review.",
                            "Never change mapped series code, unit, MPI value, source year, or dashboard year.",
                        ],
                        "mapping": _safe_mapping_payload(mapping),
                        "report": _safe_report_payload(report),
                        "expected": _truncate(expected),
                        "candidates": _truncate(candidates),
                    },
                    ensure_ascii=False,
                ),
            },
        ],
        "temperature": 0,
        "max_tokens": _env_int("OPENROUTER_MAX_TOKENS", 1200),
    }
    if strict_schema:
        body["response_format"] = {"type": "json_schema", "json_schema": _json_schema()}
        body["provider"] = {"require_parameters": True}
    return body


def _openrouter_request(
    *,
    task: str,
    mapping: dict[str, Any],
    report: dict[str, Any],
    expected: dict[str, Any],
    candidates: list[dict[str, Any]],
    strict_schema: bool,
) -> urllib.request.Request:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    base_url = os.getenv("OPENROUTER_BASE_URL", OPENROUTER_DEFAULT_BASE_URL).strip().rstrip("/")
    return urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(
            _request_payload(
                task=task,
                mapping=mapping,
                report=report,
                expected=expected,
                candidates=candidates,
                strict_schema=strict_schema,
            )
        ).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "https://sdgs-dashboard.github.io/sdgs/"),
            "X-OpenRouter-Title": os.getenv("OPENROUTER_APP_TITLE", "Rwanda SDG Dashboard NISR Automation"),
        },
        method="POST",
    )


def choose_extraction_candidate(
    *,
    task: str,
    mapping: dict[str, Any],
    report: dict[str, Any],
    expected: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> CandidateDecision | None:
    if not candidates or not openrouter_enabled():
        return None

    timeout_seconds = max(_env_int("OPENROUTER_TIMEOUT_MS", 25000), 1000) / 1000
    max_retries = max(_env_int("OPENROUTER_MAX_RETRIES", 2), 0)
    last_error: Exception | None = None
    for strict_schema in (True, False):
        for _ in range(max_retries + 1):
            request = _openrouter_request(
                task=task,
                mapping=mapping,
                report=report,
                expected=expected,
                candidates=candidates,
                strict_schema=strict_schema,
            )
            try:
                with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                    response_payload = json.loads(response.read().decode("utf-8"))
                content = response_payload["choices"][0]["message"]["content"]
                decision_payload = _extract_json(str(content))
                if not decision_payload:
                    return None
                selected_index = decision_payload.get("selected_index")
                if selected_index is not None:
                    try:
                        selected_index = int(selected_index)
                    except (TypeError, ValueError):
                        selected_index = None
                    if selected_index is not None and not 0 <= selected_index < len(candidates):
                        selected_index = None
                confidence = float(decision_payload.get("confidence_score") or 0.0)
                confidence = max(0.0, min(confidence, 1.0))
                return CandidateDecision(
                    selected_index=selected_index,
                    confidence_score=confidence,
                    status=str(decision_payload.get("status") or "needs_review"),
                    reason=str(decision_payload.get("reason") or "OpenRouter returned no explanation."),
                )
            except urllib.error.HTTPError as exc:
                try:
                    body = exc.read().decode("utf-8")[:240]
                except Exception:
                    body = str(exc)
                try:
                    error_payload = json.loads(body)
                    message = str(error_payload.get("error", {}).get("message") or f"HTTP {exc.code}")
                except Exception:
                    message = f"HTTP {exc.code}"
                last_error = RuntimeError(f"OpenRouter HTTP {exc.code}: {message}")
                if strict_schema and exc.code == 400:
                    break
                continue
            except (KeyError, TypeError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
                last_error = exc
                continue
    if last_error:
        return CandidateDecision(None, 0.0, "needs_review", f"OpenRouter unavailable: {last_error}")
    return None
