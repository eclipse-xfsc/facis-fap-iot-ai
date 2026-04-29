"""Structured JSON logging configuration for FACIS services.

Supports two output formats controlled by the LOG_FORMAT environment variable:
- "json" (default): machine-readable JSON lines, suitable for production log aggregators.
- "text": human-readable format for local development.

Sensitive field values are redacted before emission regardless of format.
"""

import logging
import os
import re
from typing import Any

from pythonjsonlogger.json import JsonFormatter

# Fields whose values must never appear in logs.
_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {"api_key", "apikey", "password", "passwd", "secret", "token", "authorization"}
)
_REDACTED = "***REDACTED***"


class _SensitiveDataFilter(logging.Filter):
    """Redact sensitive values from every LogRecord before formatting."""

    def filter(self, record: logging.LogRecord) -> bool:
        self._scrub(record.__dict__)
        return True

    def _scrub(self, mapping: dict[str, Any]) -> None:
        for key in list(mapping):
            if key.lower() in _SENSITIVE_KEYS:
                mapping[key] = _REDACTED
            elif isinstance(mapping[key], dict):
                self._scrub(mapping[key])
            elif isinstance(mapping[key], str):
                # Redact inline patterns like api_key=abc123 or "token": "xyz"
                mapping[key] = re.sub(
                    r"(?i)(api_key|apikey|password|passwd|secret|token|authorization)"
                    r'([=:\s"\']+)\S+',
                    lambda m: m.group(1) + m.group(2) + _REDACTED,
                    mapping[key],
                )


class _FACISJsonFormatter(JsonFormatter):
    """Emit a JSON line with a consistent field order."""

    def add_fields(
        self,
        log_record: dict[str, Any],
        record: logging.LogRecord,
        message_dict: dict[str, Any],
    ) -> None:
        super().add_fields(log_record, record, message_dict)
        # Normalise field names so downstream consumers don't need aliases.
        log_record.setdefault("timestamp", log_record.pop("asctime", record.asctime))
        log_record.setdefault("level", log_record.pop("levelname", record.levelname))
        log_record.setdefault("logger", log_record.pop("name", record.name))


def configure_logging(service_name: str = "") -> None:
    """Configure the root logger for structured output.

    Args:
        service_name: Optional label injected into every record as ``service``.
            Useful when multiple services write to the same log sink.
    """
    log_format = os.getenv("LOG_FORMAT", "json").lower()
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    root = logging.getLogger()
    root.setLevel(log_level)

    # Remove any handlers added by earlier basicConfig calls.
    root.handlers.clear()

    handler = logging.StreamHandler()
    handler.setLevel(log_level)
    handler.addFilter(_SensitiveDataFilter())

    if log_format == "json":
        fmt = _FACISJsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
            static_fields={"service": service_name} if service_name else {},
        )
    else:
        fmt = logging.Formatter(  # type: ignore[assignment]
            fmt="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )

    handler.setFormatter(fmt)
    root.addHandler(handler)

    # Suppress uvicorn's own text formatter; let its records flow through ours.
    for uvicorn_logger in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv = logging.getLogger(uvicorn_logger)
        uv.handlers.clear()
        uv.propagate = True
