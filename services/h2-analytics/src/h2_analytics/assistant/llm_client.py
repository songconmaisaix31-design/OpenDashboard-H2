from __future__ import annotations

import json
import re
import socket
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from h2_analytics.settings import (
    H2_LLM_BASE_URL,
    H2_LLM_RENDERER_VERSION,
    H2_LLM_TIMEOUT_SECONDS,
)

Transport = Callable[[str, bytes, dict[str, str], float], dict[str, Any]]
_NUMBER = re.compile(r"(?<![A-Za-z])[-+]?\d+(?:\.\d+)?")
_CITATION = re.compile(r"citation-[A-Za-z0-9_-]+")
_UNSAFE_CONTROL = re.compile(
    r"(?:系统|平台|模型|助手).{0,10}(?:可|能|将|会|已经|已).{0,8}(?:下发|控制|启停|修改设定|切换模式)"
)


@dataclass(frozen=True, slots=True)
class LlmRenderingConfig:
    enabled: bool = False
    api_key: str | None = None
    model: str | None = None
    base_url: str = H2_LLM_BASE_URL
    timeout_seconds: float = H2_LLM_TIMEOUT_SECONDS


class StepFunRenderer:
    def __init__(
        self,
        config: LlmRenderingConfig | None = None,
        *,
        transport: Transport | None = None,
    ) -> None:
        self._config = config or LlmRenderingConfig()
        self._transport = transport or _http_transport

    def render(
        self, *, deterministic_answer: dict[str, Any], requested: bool
    ) -> dict[str, Any]:
        base = {
            "schemaVersion": 1,
            "deterministicAnswerId": deterministic_answer["answerId"],
            "provenance": deterministic_answer["provenance"],
        }
        if not requested:
            return {**base, "status": "disabled", "reason": "not_requested"}
        if not self._config.enabled:
            return {**base, "status": "disabled", "reason": "policy_disabled"}
        if not self._config.api_key or not self._config.model:
            return {**base, "status": "disabled", "reason": "not_configured"}
        if not self._config.base_url.startswith("https://"):
            return {**base, "status": "disabled", "reason": "policy_disabled"}

        source_text = "\n".join(
            section["text"] for section in deterministic_answer["sections"]
        )
        citation_ids = tuple(
            citation["citationId"] for citation in deterministic_answer["citations"]
        )
        payload = {
            "model": self._config.model,
            "temperature": 0,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你只能润色给定的确定性中文答案，不得增加事实、数字、引用或控制权限。"
                        "输出纯文本，并保留人工确认与证据限制。"
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "deterministicAnswerText": source_text[:8_000],
                            "citationIds": citation_ids,
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                },
            ],
        }
        headers = {
            "Authorization": f"Bearer {self._config.api_key}",
            "Content-Type": "application/json",
        }
        try:
            response = self._transport(
                self._config.base_url,
                json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers,
                self._config.timeout_seconds,
            )
            rendered = _extract_text(response)
        except (TimeoutError, socket.timeout):
            return {**base, "status": "fallback", "reason": "timeout"}
        except (HTTPError, URLError, OSError, ValueError, KeyError, TypeError):
            return {**base, "status": "fallback", "reason": "provider_unavailable"}
        if not _valid_output(rendered, source_text, set(citation_ids)):
            return {**base, "status": "fallback", "reason": "invalid_output"}
        provenance = {
            **deterministic_answer["provenance"],
            "mode": "LLM_RENDERED",
            "source": "stepfun-compatible-language-rendering",
            "modelVersion": self._config.model,
            "rendererVersion": H2_LLM_RENDERER_VERSION,
            "limitations": [
                "Language-only rendering of a deterministic answer; facts and citations are unchanged."
            ],
        }
        return {
            **base,
            "status": "rendered",
            "renderedText": rendered,
            "citationIds": list(citation_ids),
            "provenance": provenance,
        }


def _http_transport(
    url: str, body: bytes, headers: dict[str, str], timeout: float
) -> dict[str, Any]:
    request = Request(url, data=body, headers=headers, method="POST")
    last_error: Exception | None = None
    for _attempt in range(2):
        try:
            opener = build_opener(_NoRedirectHandler())
            with opener.open(request, timeout=timeout) as response:  # noqa: S310
                raw = response.read(256 * 1024 + 1)
            if len(raw) > 256 * 1024:
                raise ValueError("Provider response is too large.")
            parsed = json.loads(raw.decode("utf-8"))
            if not isinstance(parsed, dict):
                raise ValueError("Provider response must be an object.")
            return parsed
        except (HTTPError, URLError, OSError) as error:
            last_error = error
    assert last_error is not None
    raise last_error


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, *_args: Any, **_kwargs: Any) -> None:
        return None


def _extract_text(response: dict[str, Any]) -> str:
    choices = response["choices"]
    if not isinstance(choices, list) or len(choices) != 1:
        raise ValueError("Provider response must contain exactly one choice.")
    message = choices[0]["message"]
    content = message["content"]
    if not isinstance(content, str):
        raise ValueError("Provider content must be text.")
    return content.strip()


def _valid_output(rendered: str, source: str, citation_ids: set[str]) -> bool:
    if not rendered or len(rendered) > 4_000 or _UNSAFE_CONTROL.search(rendered):
        return False
    if set(_CITATION.findall(rendered)) - citation_ids:
        return False
    if set(_NUMBER.findall(rendered)) - set(_NUMBER.findall(source)):
        return False
    return "人工" in rendered and ("证据" in rendered or "限制" in rendered)
