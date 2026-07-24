from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import ai_provider


class FakeOpenRouterResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeOpenRouterResponse":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_openrouter_disabled_without_api_key(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    assert not ai_provider.openrouter_enabled()
    assert (
        ai_provider.choose_extraction_candidate(
            task="test",
            mapping={"mapping_id": "MAP-001"},
            report={"report_name": "Report"},
            expected={},
            candidates=[{"value": 1}],
        )
        is None
    )


def test_openrouter_structured_request_with_model_fallbacks(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        captured["headers"] = dict(request.header_items())
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return FakeOpenRouterResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "selected_index": 1,
                                    "confidence_score": 0.91,
                                    "status": "use_candidate",
                                    "reason": "Candidate has the expected table and year.",
                                }
                            )
                        }
                    }
                ]
            }
        )

    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "openai/test-primary")
    monkeypatch.setenv("OPENROUTER_MODEL_FALLBACKS", "anthropic/test-fallback, google/test-fallback")
    monkeypatch.setenv("OPENROUTER_TIMEOUT_MS", "3000")
    monkeypatch.setattr(ai_provider.urllib.request, "urlopen", fake_urlopen)

    decision = ai_provider.choose_extraction_candidate(
        task="Choose candidate",
        mapping={"mapping_id": "MAP-001", "indicator": "1.2.1", "series_code": "SI_POV_NAHC"},
        report={"report_id": "REP-001", "report_name": "EICV"},
        expected={"table": "Table 9.1", "row": "Rwanda", "column_or_year": "2024"},
        candidates=[{"value": 27.4}, {"value": 0.136}],
    )

    assert decision is not None
    assert decision.selected_index == 1
    assert decision.confidence_score == 0.91
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["timeout"] == 3
    payload = captured["payload"]
    assert payload["models"] == ["openai/test-primary", "anthropic/test-fallback", "google/test-fallback"]
    assert payload["response_format"]["type"] == "json_schema"
    assert payload["provider"]["require_parameters"] is True


def test_openrouter_invalid_json_fails_closed(monkeypatch) -> None:
    def fake_urlopen(request, timeout):
        return FakeOpenRouterResponse({"choices": [{"message": {"content": "not json"}}]})

    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(ai_provider.urllib.request, "urlopen", fake_urlopen)

    assert (
        ai_provider.choose_extraction_candidate(
            task="Choose candidate",
            mapping={"mapping_id": "MAP-001"},
            report={"report_name": "EICV"},
            expected={},
            candidates=[{"value": 27.4}],
        )
        is None
    )
