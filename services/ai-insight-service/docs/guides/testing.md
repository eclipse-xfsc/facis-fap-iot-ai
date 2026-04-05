# Testing Guide

**Project:** FACIS FAP IoT & AI — AI Insight Service  
**Version:** 0.1.0  
**Date:** 05 April 2026

---

## 1. Test Structure Overview

The AI Insight Service has comprehensive test coverage organized by concern. The table below maps all test files to their primary purpose:

| Test File | Purpose | Test Count |
|---|---|---|
| `tests/test_api.py` | REST API endpoints, policy enforcement, rate limiting, error handling | ~9 tests |
| `tests/test_llm_client.py` | LLM provider client initialization, retries, HTTP status handling | ~3 tests |
| `tests/test_insight_cache.py` | Cache key generation, TTL behavior, parameter stability | ~2 tests |
| `tests/test_rate_limit.py` | Agreement-based rate limiting, sliding window enforcement | ~1 test |
| `tests/test_policy_enforcement.py` | Policy checks (agreement, asset, roles), enforcement behavior | ~3 tests |
| `tests/test_output_store.py` | In-memory store persistence, retrieval, type filtering | ~2 tests |
| `tests/test_outliers.py` | Metric outlier detection, spike/drop flagging | ~1 test |
| `tests/test_service.py` | Outlier context generation from Trino queries | ~2 tests |
| `tests/test_trend_forecast.py` | Trend forecast analysis, context building, fallback hours | ~3 tests |
| `tests/test_trend_forecast_service.py` | Trend forecast service context generation, validation | ~4 tests |
| `tests/test_smart_city_correlation.py` | Event infrastructure correlation, confidence scoring | ~2 tests |
| `tests/test_smart_city_correlation_service.py` | Smart city service context generation, time window validation | ~3 tests |
| `tests/test_prompt_templates.py` | Prompt rendering, schema consistency, template override | ~7 tests |
| `tests/test_trino_auth.py` | Trino OIDC auth, JWT token extraction, table queries | ~8 tests |
| `tests/integration/test_ai_pipeline_integration.py` | End-to-end pipeline, fallback scenarios, fixture setup | ~15 tests |
| `tests/bdd/test_ai_insight_generation_bdd.py` | Business scenarios via pytest-bdd from feature files | ~13 scenarios |

---

## 2. Running Tests

### 2.1 Full Test Suite

Run all unit, BDD, and integration tests with coverage:

```bash
pytest --cov=src --cov-report=term-missing
```

Run with verbose output and test timings:

```bash
pytest -v --tb=short
```

Run with timeout enforcement (10 seconds per test):

```bash
pytest --timeout=10
```

### 2.2 Unit Tests Only

Unit tests validate individual components without external services:

```bash
pytest tests/test_*.py -v
```

Exclude integration tests:

```bash
pytest tests/ --ignore=tests/integration/ --ignore=tests/bdd/ -v
```

### 2.3 BDD Tests Only

Business-driven scenarios from feature files:

```bash
pytest tests/bdd/ -v
```

Run a single scenario:

```bash
pytest tests/bdd/test_ai_insight_generation_bdd.py::test_energy_anomaly_detection -v
```

### 2.4 Integration Tests Only

Integration tests use fixtures (conftest.py) that may require additional setup (e.g., mocked Trino):

```bash
pytest tests/integration/ -v
```

Run a single integration test:

```bash
pytest tests/integration/test_ai_pipeline_integration.py::test_anomaly_report_pipeline_e2e -v
```

### 2.5 Coverage Report

Generate detailed HTML coverage report:

```bash
pytest --cov=src --cov-report=html
open htmlcov/index.html   # macOS
xdg-open htmlcov/index.html   # Linux
```

View coverage in terminal with missing line numbers:

```bash
pytest --cov=src --cov-report=term-missing --cov-report=term-missing:skip-covered
```

---

## 3. BDD Scenarios

Behavior-driven development scenarios are defined in `tests/bdd/features/ai_insight_generation.feature` and executed via pytest-bdd. They validate business workflows at the API level.

**Scenario categories:**

- **Insight Generation** — Energy anomaly detection, smart city event analysis, energy summaries with correct response format
- **Data Context** — Query inclusion via `include_data` parameter returns analytics context
- **Output Lookup** — Latest insights retrieval and per-id output retrieval
- **Validation** — Invalid time windows (reversed bounds), incomplete payloads, schema mismatches
- **Fallback Behavior** — LLM unavailable (5xx), LLM output malformed (non-JSON), LLM schema invalid, zero data rows
- **Policy & Security** — Missing governance headers returns 403, missing consumer role returns 403
- **Rate Limiting** — Two consecutive requests within limit returns 200, then 429; retry-after header present
- **Metadata** — Successful LLM response hides `llm_error` field; empty latest state before first request

Run all BDD tests:

```bash
pytest tests/bdd/ -v
```

Run with step-by-step output:

```bash
pytest tests/bdd/ -v --tb=short -s
```

---

## 4. Unit Tests by Module

Each unit test file focuses on a single module or concern:

### Insight Cache (`test_insight_cache.py`)
Validates cache key generation and parameter identity:
- Cache key is stable for identical request parameters (same input → same key)
- Cache key differs when output-affecting parameters change (different threshold → different key)

### Rate Limiting (`test_rate_limit.py`)
Tests agreement-based sliding-window enforcement:
- Blocks requests after threshold (10 requests/minute by default)
- Tracks per-agreement state independently

### Policy Enforcement (`test_policy_enforcement.py`)
Tests access control from headers:
- Denies missing X-Agreement-Id header
- Denies when X-User-Roles doesn't include `ai_insight_consumer`
- Allows matching agreement and role

### Output Store (`test_output_store.py`)
Tests in-memory persistence:
- Save records with UUID, retrieve by ID
- Query latest insight per type (anomaly-report, city-status, energy-summary)

### Outlier Detection (`test_outliers.py`)
Tests metric spike/drop flagging:
- Flags values exceeding robust z-score threshold
- Distinguishes spikes (increases) from drops (decreases)

### LLM Client (`test_llm_client.py`)
Tests provider-agnostic chat client:
- Extracts message content from OpenAI-compatible response format
- Retries on HTTP 429 (rate limit), exhausts after max_retries, then raises `LLMRateLimitError`
- Uses configured `chat_completions_url` (with HTTPS enforcement by default)

### Trend Forecast (`test_trend_forecast.py`)
Tests trend analysis and context building:
- Generates 24-point forecast from hourly input
- Context has stable keys (sort order deterministic for prompting)
- Falls back to hourly aggregation when daily overview unavailable

### Smart City Correlation (`test_smart_city_correlation.py`)
Tests event-to-infrastructure correlation:
- Detects high-confidence pattern matches (e.g., streetlight outage → traffic congestion)
- Context schema is stable for deterministic prompt generation

### Prompt Templates (`test_prompt_templates.py`)
Tests prompt generation:
- System prompt includes required sections (instructions, context structure, constraints)
- User prompt is deterministic (same input → same prompt)
- Payload schema matches expected structure for all insight types
- Can be overridden from filesystem (when enabled), falls back to built-in templates

### Trino Authentication (`test_trino_auth.py`)
Tests Trino OIDC auth and queries:
- JWT token fetched via OIDC password flow (client_id + client_secret + username + password)
- Token extracted from `access_token` field; error if missing
- Queries built with UTC timestamp bounds and normalized ISO8601 format
- Supports table name overrides (e.g., `TRINO_TABLE_NET_GRID_HOURLY`)
- Fetch functions validate time window (start < end)

### Services (`test_service.py`, `test_trend_forecast_service.py`, `test_smart_city_correlation_service.py`)
Test high-level context builders:
- Handle empty result sets gracefully
- Validate time window bounds before querying
- Aggregate Trino results into structured context dicts
- Respect configuration (e.g., forecast hours, correlation threshold)

---

## 5. Integration Tests

Integration tests in `tests/integration/test_ai_pipeline_integration.py` exercise the full pipeline with realistic dependencies (FastAPI TestClient, mocked Trino, fallback orchestration).

**Key test scenarios:**

| Test | Purpose |
|---|---|
| `test_anomaly_report_pipeline_e2e` | Anomaly report generation with real LLM mocking |
| `test_anomaly_report_include_data_returns_context` | Verify `include_data=true` returns context dict |
| `test_city_status_pipeline_e2e` | Smart city analysis generation |
| `test_energy_summary_pipeline_e2e` | Trend forecast analysis generation |
| `test_latest_and_output_lookup_work_end_to_end` | Latest query and per-id retrieval |
| `test_output_lookup_returns_404_for_missing_id` | Missing output returns 404 |
| `test_invalid_window_returns_400` | Reversed time window returns 400 with "earlier" message |
| `test_invalid_payload_returns_422` | Missing required fields return 422 validation error |
| `test_pipeline_falls_back_when_llm_unavailable` | LLM HTTP 500 triggers fallback, metadata shows "integration llm down" |
| `test_pipeline_falls_back_when_llm_output_is_not_json` | Non-JSON response triggers fallback |
| `test_pipeline_falls_back_when_llm_output_schema_is_invalid` | JSON with wrong schema triggers fallback |
| `test_pipeline_skips_llm_when_rows_analyzed_is_zero` | No data rows → deterministic fallback only, `rows_analyzed=0` in metadata |
| `test_policy_requires_headers_when_enabled` | Missing X-Agreement-Id → 403 |
| `test_policy_requires_role_when_enabled` | Missing ai_insight_consumer role → 403 |
| `test_rate_limit_returns_429_when_enabled` | Two requests in 60s → 200 then 429 with retry-after |
| `test_dev_mode_hides_llm_error_for_successful_llm_response` | `llm_error` null when LLM succeeds |
| `test_latest_endpoint_empty_before_any_insight` | Latest returns empty before first request |

**Fixtures** (from `tests/integration/conftest.py`):
- `integration_client` — FastAPI TestClient configured with mocked dependencies
- `mock_trino_client` — Returns fixture data (zero rows, synthetic data)
- `mock_llm_client` — Returns valid JSON or failure responses based on scenario
- `mock_cache` — Disabled or in-memory fallback

---

## 6. Writing New Tests

### Test Naming and Organization

- Test files: `test_<module>.py` (e.g., `test_llm_client.py`)
- Test functions: `test_<behavior>` (e.g., `test_client_retries_on_429_then_raises`)
- Test classes (fixtures): `_Fake<Component>`, `_Mock<Dependency>` (leading underscore indicates test-only)

### Fixture Usage

Fixtures are defined in `tests/conftest.py` and `tests/integration/conftest.py`:

```python
@pytest.fixture
def app():
    """FastAPI app fixture."""
    return create_app()

@pytest.fixture
def client():
    """HTTP test client fixture."""
    return TestClient(create_app())
```

Use in tests:

```python
def test_health_endpoint(client) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

### Mocking Patterns

**Mock Trino client** for unit tests:

```python
class _FakeTrinoClient:
    def fetch_net_grid_hourly(self, start_ts, end_ts, timezone):
        return [
            {"timestamp": "2026-01-01T00:00Z", "power_mw": 100.5},
            {"timestamp": "2026-01-01T01:00Z", "power_mw": 102.3},
        ]
```

**Mock LLM client** for fallback scenarios:

```python
class _FailingLLMClient:
    def create_chat_completion(self, messages, model=None, temperature=0.2):
        raise LLMUpstreamError("Service unavailable")
```

**Mock policy enforcer**:

```python
class _FakePolicy:
    def enforce(self, context):
        if not context.agreement_id:
            raise PolicyDeniedError("Missing agreement identifier")
```

**Override configuration** for tests:

```python
def test_with_custom_config(monkeypatch):
    monkeypatch.setenv("AI_INSIGHT_LLM__API_KEY", "test-key")
    monkeypatch.setenv("AI_INSIGHT_LLM__CHAT_COMPLETIONS_URL", "https://api.test/v1/chat")
    # Test code here
```

### Async Test Support

Async tests use `pytest-asyncio`:

```python
@pytest.mark.asyncio
async def test_async_cache_operation():
    cache = RedisInsightCache(redis_url="redis://localhost", connect_timeout_seconds=5)
    # async test code here
```

---

## 7. Code Quality Tools

### 7.1 Linting (Ruff)

Ruff checks code for errors and style violations. Configuration in `pyproject.toml`:
- Line length: 100 characters
- Target: Python 3.11
- Rules: E (pycodestyle), F (Pyflakes), I (isort), N (naming), W (warnings), UP (upgrades)

Check for issues:

```bash
ruff check src/ tests/
```

Auto-fix safe issues:

```bash
ruff check --fix src/ tests/
```

Common issues ruff catches:
- Unused imports (`F401`)
- Import order (`I001`)
- Line too long (`E501`)
- Undefined names (`F821`)
- Naming convention violations (`N802`, `N999`)

### 7.2 Formatting (Black)

Black enforces consistent code formatting. Configuration in `pyproject.toml`:
- Line length: 100 characters (same as ruff)

Check formatting without changes:

```bash
black --check src/ tests/
```

Apply formatting:

```bash
black src/ tests/
```

Black enforces:
- 4-space indentation
- Double quotes by default (configurable)
- Single blank line between functions, two between classes
- Parenthesis normalization

### 7.3 Type Checking (Mypy)

Mypy validates type annotations and catches type mismatches. Configuration in `pyproject.toml`:
- Strict mode: disabled (non-strict for compatibility)
- Missing imports: ignored (for untyped dependencies)
- Target: Python 3.11

Run type checking:

```bash
mypy src/
```

Run on tests as well:

```bash
mypy src/ tests/
```

Ignore type errors for specific lines:

```python
import untyped_library  # type: ignore
```

### 7.4 Pre-commit Workflow

Run all checks in order before committing:

```bash
ruff check src/ tests/ && black --check src/ tests/ && mypy src/ && pytest
```

Or create a shell script `scripts/quality.sh`:

```bash
#!/bin/bash
set -e
echo "Linting with ruff..."
ruff check src/ tests/
echo "Checking format with black..."
black --check src/ tests/
echo "Type checking with mypy..."
mypy src/
echo "Running tests..."
pytest --cov=src --cov-report=term-missing
echo "All checks passed!"
```

Then make it executable and run:

```bash
bash scripts/quality.sh
```

---

(c) ATLAS IoT Lab GmbH -- FACIS FAP IoT & AI Demonstrator
Licensed under Apache License 2.0
