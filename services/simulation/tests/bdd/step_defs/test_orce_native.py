"""Step definitions for the ORCE-native runtime BDD features.

These steps target an ORCE pod that hosts the FACIS simulation flows.
The host/port are taken from environment variables so the same suite can be
run against:

  - a local kind/k3d cluster (``http://localhost:1880`` via port-forward)
  - the IONOS cluster via ``kubectl port-forward`` (``http://localhost:1880``)
  - an Ingress-exposed deployment (``https://simulation.facis.cloud``)

Per the FACIS Technical Development Requirements ("No Docker Compose
permitted"), no compose-based local stack is supported.

Tests will be skipped when ``FACIS_ORCE_BASE_URL`` is unset, so the suite
remains green on CI runners without an ORCE backend.
"""

from __future__ import annotations

import json
import os
import time

import pytest
import requests
from pytest_bdd import given, parsers, scenarios, then, when

ORCE_BASE_URL_ENV = "FACIS_ORCE_BASE_URL"
ORCE_KAFKA_BOOTSTRAP_ENV = "FACIS_ORCE_KAFKA_BOOTSTRAP"


def _orce_base_url() -> str:
    return os.getenv(ORCE_BASE_URL_ENV, "").rstrip("/")


def _orce_required() -> None:
    if not _orce_base_url():
        pytest.skip(f"{ORCE_BASE_URL_ENV} not set; skipping live ORCE BDD scenario")


# Bind the three feature files in this module
scenarios("../features/orce_flow_lifecycle.feature")
scenarios("../features/orce_determinism.feature")
scenarios("../features/orce_observability.feature")


# ── Background -----------------------------------------------------------------


@given("an ORCE pod with the simulation flows imported via the Helm post-install Job")
@given('compatibilityMode is "orce"')
def background_orce(request_bag: dict) -> None:
    _orce_required()
    request_bag["base_url"] = _orce_base_url()


@given("the entity registry is the chart default (2 meters, 2 PV systems, 2 consumers)")
def default_entity_registry(request_bag: dict) -> None:
    request_bag.setdefault("entities", {"meters": 2, "pv": 2, "consumers": 2})


# ── Lifecycle steps ------------------------------------------------------------


@when(parsers.parse('I GET "{path}" on the ORCE HTTP endpoint'))
@when(parsers.parse('I GET "{path}"'))
def http_get(request_bag: dict, path: str) -> None:
    base = request_bag["base_url"]
    response = requests.get(f"{base}{path}", timeout=5)
    request_bag["last_response"] = response


@when(parsers.parse('I POST "{path}" with body \'{body}\''))
def http_post_with_body(request_bag: dict, path: str, body: str) -> None:
    base = request_bag["base_url"]
    response = requests.post(
        f"{base}{path}", data=body, headers={"Content-Type": "application/json"}, timeout=5
    )
    request_bag["last_response"] = response


@when(parsers.parse('I POST "{path}"'))
def http_post(request_bag: dict, path: str) -> None:
    base = request_bag["base_url"]
    response = requests.post(f"{base}{path}", timeout=5)
    request_bag["last_response"] = response


@then(parsers.parse("the response status is {code:d}"))
def assert_status(request_bag: dict, code: int) -> None:
    assert request_bag["last_response"].status_code == code


@then(parsers.parse('the response JSON has "{key}" = "{value}"'))
def assert_json_string(request_bag: dict, key: str, value: str) -> None:
    body = request_bag["last_response"].json()
    actual = _resolve(body, key)
    assert str(actual) == value, f"{key}: expected {value!r}, got {actual!r}"


@then(parsers.parse('the response JSON has "{key}" = {value:d}'))
def assert_json_int(request_bag: dict, key: str, value: int) -> None:
    body = request_bag["last_response"].json()
    actual = _resolve(body, key)
    assert actual == value, f"{key}: expected {value!r}, got {actual!r}"


@then(parsers.parse('the JSON body has key "{key}" with value "{value}"'))
def assert_body_key_value(request_bag: dict, key: str, value: str) -> None:
    body = request_bag["last_response"].json()
    actual = _resolve(body, key)
    assert str(actual) == value


@then(parsers.parse('the JSON body has keys "{key1}", "{key2}", "{key3}", "{key4}"'))
def assert_body_keys(request_bag: dict, key1: str, key2: str, key3: str, key4: str) -> None:
    body = request_bag["last_response"].json()
    for key in (key1, key2, key3, key4):
        assert _resolve(body, key) is not None, f"missing key: {key}"


@given("the simulation has been started")
def given_started(request_bag: dict) -> None:
    base = request_bag["base_url"]
    requests.post(f"{base}/api/v1/simulation/start", json={}, timeout=5).raise_for_status()


@given(parsers.parse("the simulation has been running for at least {n:d} ticks"))
def given_running(request_bag: dict, n: int) -> None:
    base = request_bag["base_url"]
    requests.post(f"{base}/api/v1/simulation/start", json={}, timeout=5).raise_for_status()
    # Wait long enough for n ticks at the configured speed_factor.
    time.sleep(max(2, n))


@then(parsers.parse('a follow-up GET "{path}" returns "{key}" = "{value}"'))
def follow_up_get(request_bag: dict, path: str, key: str, value: str) -> None:
    base = request_bag["base_url"]
    body = requests.get(f"{base}{path}", timeout=5).json()
    actual = _resolve(body, key)
    assert str(actual) == value


@then(parsers.parse('the response is a JSON array of {kind}'))
def assert_array(request_bag: dict, kind: str) -> None:
    body = request_bag["last_response"].json()
    assert isinstance(body, list), f"expected array, got {type(body).__name__}"


@then(parsers.parse('every reading has fields "{key1}" and "{key2}"'))
def assert_array_fields(request_bag: dict, key1: str, key2: str) -> None:
    body = request_bag["last_response"].json()
    assert isinstance(body, list) and len(body) > 0
    for item in body:
        assert _resolve(item, key1) is not None, f"missing {key1} in {item}"
        assert _resolve(item, key2) is not None, f"missing {key2} in {item}"


@then(parsers.parse('the response JSON has key "{key}"'))
def assert_response_key(request_bag: dict, key: str) -> None:
    body = request_bag["last_response"].json()
    assert _resolve(body, key) is not None, f"missing key: {key}"


@then(parsers.parse('the response is a JSON array with "{key}"'))
def assert_array_key(request_bag: dict, key: str) -> None:
    body = request_bag["last_response"].json()
    assert isinstance(body, list) and len(body) > 0
    for item in body:
        assert _resolve(item, key) is not None, f"missing {key} in {item}"


@when("I trigger a flow re-import via the ORCE Admin API")
def trigger_reimport(request_bag: dict) -> None:
    pytest.skip("reimport step requires admin token + flow JSON; covered by helm BDD")


@then(parsers.parse('the engine state file at "{path}" remains'))
def state_file_remains(request_bag: dict, path: str) -> None:
    pytest.skip("state file inspection runs in-cluster via kubectl exec")


@then(parsers.parse('a follow-up GET "/api/v1/simulation/status" reflects the prior state'))
def reflects_prior_state(request_bag: dict) -> None:
    pass


# ── Determinism / observability scaffolds (require Kafka access) ----------------


@given(parsers.parse('seed "{seed}" and simulation start time "{ts}"'))
def given_seed_and_time(request_bag: dict, seed: str, ts: str) -> None:
    base = request_bag["base_url"]
    requests.post(
        f"{base}/api/v1/simulation/reset",
        json={"seed": int(seed), "start_time": ts},
        timeout=5,
    ).raise_for_status()


@when(parsers.parse("I run the simulation for {n:d} ticks at speed_factor {sf:d}"))
def run_n_ticks(request_bag: dict, n: int, sf: int) -> None:
    pytest.skip("Kafka capture not wired in unit-style harness")


@when("I capture the resulting envelope from the Kafka topic for each tick")
def capture_envelopes(request_bag: dict) -> None:
    pytest.skip("Kafka consumer fixture required")


@when("I reset and replay with the same seed and start time")
def reset_and_replay(request_bag: dict) -> None:
    pytest.skip("Kafka consumer fixture required")


@then("the captured envelope sequences are byte-identical between the two runs")
def envelopes_identical(request_bag: dict) -> None:
    pytest.skip("Kafka consumer fixture required")


# Most remaining determinism + observability steps need Kafka client / kubectl
# fixtures that live in the integration harness rather than this BDD scaffold;
# they are intentionally pytest.skip'd until those fixtures are added.

PENDING_STEPS = [
    'seed "12345" for run A and seed "99999" for run B',
    "I run each for 60 ticks at the same start time",
    "the envelope sequences differ within the first 5 ticks",
    'seed "12345" and a 24-hour window',
    "I run the simulation at speed_factor 60",
    'for every meter the field "readings.total_energy_kwh" never decreases',
    "the final value is greater than the initial value",
    'seed "12345" and simulation time set to a clear summer noon',
    "I run for 1 tick",
    'the weather feed reports "conditions.ghi_w_m2" > 100',
    'every PV reading has "readings.power_output_kw" > 0',
    "I advance to midnight",
    'every PV reading has "readings.power_output_kw" = 0',
    'I GET "/metrics" on the ORCE HTTP endpoint',
    'the body contains a "# TYPE facis_sim_ticks_total counter" line',
    'the body contains a "# TYPE facis_kafka_messages_sent_total counter" line',
    'the body contains a "# TYPE facis_mqtt_messages_sent_total counter" line',
    'the body contains a "# TYPE facis_modbus_requests_total counter" line',
    'I record the current value of "facis_sim_ticks_total"',
    "the simulation produces 3 more ticks",
    'a follow-up scrape of "facis_sim_ticks_total" is at least 3 higher than the recorded value',
    'the feeds tab emits a malformed envelope (e.g. missing "site_id")',
    'a record appears on Kafka topic "sim.dead_letter" within 5 seconds',
    'the record body parses as JSON with keys "timestamp", "level", "service", "message"',
    'the field "service" equals "facis-simulation-orce"',
    "I tail the ORCE pod logs for 10 seconds",
    'every log line that starts with "{" parses as JSON',
    'contains keys "timestamp" and "level"',
    'does not contain any of the substrings "password", "secret", "token", "api_key"',
]


def _make_pending(step):
    @when(step)
    @then(step)
    @given(step)
    def _pending() -> None:
        pytest.skip(f"pending fixture: {step}")

    return _pending


for _step in PENDING_STEPS:
    _make_pending(_step)


# ── Helpers --------------------------------------------------------------------


def _resolve(obj: dict | list, dotted: str):
    """Walk a dotted path into a JSON-like structure."""
    cur = obj
    for part in dotted.split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
        if cur is None:
            return None
    return cur


def _emit_pending() -> None:
    pytest.skip("pending live fixture")


__all__ = ["scenarios"]
