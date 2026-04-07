"""Provider-agnostic chat client with retry logic and circuit breaker."""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urlparse

import requests  # type: ignore[import-untyped]
from tenacity import (
    RetryError,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.config import LlmConfig

logger = logging.getLogger(__name__)


class LLMClientError(Exception):
    """Base class for LLM client failures."""


class LLMRateLimitError(LLMClientError):
    """Raised when upstream responds with 429 and retries are exhausted."""


class LLMUpstreamError(LLMClientError):
    """Raised when upstream keeps failing with 5xx/transport errors."""


class LLMCircuitOpenError(LLMClientError):
    """Raised when the circuit breaker is open (too many consecutive failures)."""


class OpenAICompatibleClient:
    """Minimal provider-agnostic chat completion client with circuit breaker."""

    # Circuit breaker state
    CIRCUIT_FAILURE_THRESHOLD = 5
    CIRCUIT_RECOVERY_SECONDS = 60

    def __init__(self, config: LlmConfig) -> None:
        self._config = config
        self._consecutive_failures = 0
        self._circuit_open_until: float = 0

    def _endpoint_url(self) -> str:
        if not self._config.chat_completions_url:
            raise LLMClientError("LLM chat_completions_url is required")
        parsed = urlparse(self._config.chat_completions_url)
        if self._config.require_https and parsed.scheme.lower() != "https":
            raise LLMClientError("LLM chat_completions_url must use https")
        return self._config.chat_completions_url

    def _build_headers(self) -> dict[str, str]:
        if not self._config.api_key:
            raise LLMClientError("LLM api_key is required")
        return {
            "Authorization": f"Bearer {self._config.api_key}",
            "Content-Type": "application/json",
        }

    def _check_circuit(self) -> None:
        """Check if the circuit breaker is open."""
        if self._consecutive_failures >= self.CIRCUIT_FAILURE_THRESHOLD:
            if time.monotonic() < self._circuit_open_until:
                raise LLMCircuitOpenError(
                    f"Circuit breaker open: {self._consecutive_failures} consecutive "
                    f"failures. Recovery in {self._circuit_open_until - time.monotonic():.0f}s"
                )
            # Recovery period elapsed — allow a probe request (half-open)
            logger.info("Circuit breaker half-open: allowing probe request")

    def _record_success(self) -> None:
        if self._consecutive_failures > 0:
            logger.info(
                f"LLM recovered after {self._consecutive_failures} consecutive failures"
            )
        self._consecutive_failures = 0

    def _record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= self.CIRCUIT_FAILURE_THRESHOLD:
            self._circuit_open_until = time.monotonic() + self.CIRCUIT_RECOVERY_SECONDS
            logger.warning(
                f"Circuit breaker OPEN: {self._consecutive_failures} consecutive failures. "
                f"Blocking requests for {self.CIRCUIT_RECOVERY_SECONDS}s"
            )

    @property
    def is_circuit_open(self) -> bool:
        """Check if the circuit breaker is currently open."""
        return (
            self._consecutive_failures >= self.CIRCUIT_FAILURE_THRESHOLD
            and time.monotonic() < self._circuit_open_until
        )

    def create_chat_completion(
        self,
        *,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.2,
    ) -> tuple[str, dict[str, Any]]:
        """Send chat request and return model text + raw response JSON."""
        self._check_circuit()

        endpoint = self._endpoint_url()
        headers = self._build_headers()
        payload: dict[str, Any] = {
            "model": model or self._config.model,
            "messages": messages,
            "temperature": temperature,
        }

        try:
            text, body = self._request_with_retry(endpoint, headers, payload)
            self._record_success()
            return text, body
        except (LLMRateLimitError, LLMUpstreamError):
            self._record_failure()
            raise

    def _request_with_retry(
        self,
        endpoint: str,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any]]:
        """Execute HTTP request with tenacity retry and exponential backoff."""
        max_attempts = self._config.max_retries + 1

        @retry(
            stop=stop_after_attempt(max_attempts),
            wait=wait_exponential(
                multiplier=self._config.retry_base_delay_seconds,
                max=self._config.retry_max_delay_seconds,
            ),
            retry=retry_if_exception_type((_RetryableError,)),
            reraise=True,
        )
        def _do_request() -> tuple[str, dict[str, Any]]:
            try:
                response = requests.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    timeout=self._config.timeout_seconds,
                )
            except requests.RequestException as error:
                raise _RetryableError(str(error)) from error

            if response.status_code == 429:
                raise _RetryableError("Rate limited (429)")
            if 500 <= response.status_code <= 599:
                raise _RetryableError(f"Server error ({response.status_code})")
            if response.status_code >= 400:
                raise LLMClientError(
                    f"LLM request failed with status {response.status_code}"
                )

            body = response.json()
            text = self._extract_content(body)
            return text, body

        try:
            return _do_request()
        except RetryError as e:
            cause = e.last_attempt.exception()
            if cause and "429" in str(cause):
                raise LLMRateLimitError("LLM rate limit exceeded") from cause
            raise LLMUpstreamError(
                f"LLM request failed after {max_attempts} attempts"
            ) from cause

    @staticmethod
    def _extract_content(response_body: dict[str, Any]) -> str:
        choices = response_body.get("choices")
        if not isinstance(choices, list) or not choices:
            raise LLMClientError("LLM response missing choices")
        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            raise LLMClientError("LLM response choices[0] is invalid")
        message = first_choice.get("message")
        if not isinstance(message, dict):
            raise LLMClientError("LLM response missing message")
        content = message.get("content")
        if not isinstance(content, str):
            raise LLMClientError("LLM response missing message content")
        return content


class _RetryableError(Exception):
    """Internal error type for tenacity retry decisions."""
