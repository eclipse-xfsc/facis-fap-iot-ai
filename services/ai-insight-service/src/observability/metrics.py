"""Prometheus metrics for the AI Insight Service."""

from __future__ import annotations

from prometheus_client import Counter, Histogram, make_asgi_app

# ---------------------------------------------------------------------------
# Request metrics
# ---------------------------------------------------------------------------

INSIGHT_REQUESTS = Counter(
    "facis_insight_requests_total",
    "Total insight requests received",
    ["insight_type", "status"],
)

INSIGHT_LATENCY = Histogram(
    "facis_insight_latency_seconds",
    "Insight request processing latency",
    ["insight_type"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0],
)

# ---------------------------------------------------------------------------
# LLM metrics
# ---------------------------------------------------------------------------

LLM_CALLS = Counter(
    "facis_llm_calls_total",
    "Total LLM API calls",
    ["model", "status"],
)

LLM_LATENCY = Histogram(
    "facis_llm_latency_seconds",
    "LLM API call latency",
    ["model"],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0],
)

# ---------------------------------------------------------------------------
# Policy / security metrics
# ---------------------------------------------------------------------------

POLICY_DENIALS = Counter(
    "facis_policy_denials_total",
    "Total policy enforcement denials",
    ["reason"],
)

RATE_LIMIT_EXCEEDED = Counter(
    "facis_rate_limit_exceeded_total",
    "Total rate limit exceeded events",
    ["agreement_id"],
)

# ---------------------------------------------------------------------------
# Cache metrics
# ---------------------------------------------------------------------------

CACHE_HITS = Counter(
    "facis_cache_hits_total",
    "Total cache hits",
)

CACHE_MISSES = Counter(
    "facis_cache_misses_total",
    "Total cache misses",
)


def create_metrics_app():
    """Create an ASGI app that serves /metrics for Prometheus scraping."""
    return make_asgi_app()
