"""
Step definitions for Security and Integration BDD scenarios.

These tests verify:
- TLS enforcement on the ingress layer
- Absence of secret values in pod logs
- Pod security context constraints (non-root, read-only FS, dropped capabilities)
- ServiceAccount token mount restrictions
- Keycloak OIDC token issuance and JWT claim validation
- Policy-based access control on the AI insight service
- Rate limiting enforcement per agreement ID

All tests are marked ``@pytest.mark.integration`` and are skipped automatically
in CI pipelines that lack a live cluster or external services.

Environment variables
---------------------
FACIS_NAMESPACE          Target namespace. Default: ``facis``.
AI_INSIGHT_BASE_URL      Base URL for the AI insight service REST API.
                         Default: ``http://localhost:8080``.
KEYCLOAK_URL             Keycloak base URL (e.g. https://keycloak.facis.cloud).
KEYCLOAK_REALM           OIDC realm name. Default: ``facis``.
KEYCLOAK_CLIENT_ID       OIDC client ID.
KEYCLOAK_CLIENT_SECRET   OIDC client secret.
KEYCLOAK_USERNAME        Test user username.
KEYCLOAK_PASSWORD        Test user password.
AI_INSIGHT_AGREEMENT_ID  Agreement ID used in policy header tests.
AI_INSIGHT_ROLE          Role value used in policy header tests.
                         Default: ``ai_insight_consumer``.
RATE_LIMIT_RPM           Requests-per-minute ceiling to assert against.
                         Default: ``5``.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import socket
import ssl
import subprocess
import time
from typing import Any
from urllib.parse import urljoin

import httpx
import pytest
from pytest_bdd import given, parsers, scenarios, then, when

# ---------------------------------------------------------------------------
# Feature binding
# ---------------------------------------------------------------------------
scenarios("../features/security_integration.feature")

# ---------------------------------------------------------------------------
# Environment-driven configuration
# ---------------------------------------------------------------------------
NAMESPACE = os.environ.get("FACIS_NAMESPACE", "facis")
AI_BASE_URL = os.environ.get("AI_INSIGHT_BASE_URL", "http://localhost:8080")
KEYCLOAK_URL = os.environ.get("KEYCLOAK_URL", "")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "facis")
KEYCLOAK_CLIENT_ID = os.environ.get("KEYCLOAK_CLIENT_ID", "")
KEYCLOAK_CLIENT_SECRET = os.environ.get("KEYCLOAK_CLIENT_SECRET", "")
KEYCLOAK_USERNAME = os.environ.get("KEYCLOAK_USERNAME", "")
KEYCLOAK_PASSWORD = os.environ.get("KEYCLOAK_PASSWORD", "")
AGREEMENT_ID = os.environ.get("AI_INSIGHT_AGREEMENT_ID", "test-agreement-001")
ROLE_VALUE = os.environ.get("AI_INSIGHT_ROLE", "ai_insight_consumer")
RATE_LIMIT_RPM = int(os.environ.get("RATE_LIMIT_RPM", "5"))

# Known policy header names (must match default.yaml policy section)
AGREEMENT_HEADER = "x-agreement-id"
ROLE_HEADER = "x-user-roles"

# Simulation release label used to locate pods
SIM_RELEASE = os.environ.get("FACIS_RELEASE", "facis-simulation")
AI_RELEASE = "ai-insight-service"

# ---------------------------------------------------------------------------
# Pytest markers
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Helper: skip guards
# ---------------------------------------------------------------------------


def _require_kubectl() -> None:
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not found on PATH")
    result = subprocess.run(
        ["kubectl", "cluster-info"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        pytest.skip("Kubernetes cluster not reachable")


def _require_keycloak() -> None:
    if not KEYCLOAK_URL:
        pytest.skip("KEYCLOAK_URL not set — skipping Keycloak integration test")


def _require_ai_service() -> None:
    try:
        resp = httpx.get(urljoin(AI_BASE_URL, "/api/v1/health"), timeout=5)
        if resp.status_code not in (200, 401, 403):
            pytest.skip(f"AI insight service not reachable at {AI_BASE_URL}")
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip(f"AI insight service not reachable at {AI_BASE_URL}")


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------


def _kubectl(
    *args: str, check: bool = True, timeout: int = 60
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["kubectl", *args, "--namespace", NAMESPACE],
        capture_output=True,
        text=True,
        check=check,
        timeout=timeout,
    )


def _kubectl_get_json(resource: str, name: str) -> dict[str, Any]:
    result = _kubectl("get", resource, name, "-o", "json", check=False)
    if result.returncode != 0:
        return {}
    return json.loads(result.stdout)


def _get_pod_logs(label_selector: str, tail: int = 200) -> str:
    """Return concatenated logs from the first pod matching the selector."""
    result = _kubectl(
        "logs",
        "-l",
        label_selector,
        "--tail",
        str(tail),
        check=False,
    )
    return result.stdout if result.returncode == 0 else ""


def _get_secret_values(secret_name: str) -> list[str]:
    """Return the decoded values of all keys in a Kubernetes secret."""
    result = _kubectl("get", "secret", secret_name, "-o", "json", check=False)
    if result.returncode != 0:
        return []
    secret = json.loads(result.stdout)
    values: list[str] = []
    for encoded in secret.get("data", {}).values():
        try:
            values.append(base64.b64decode(encoded).decode("utf-8", errors="replace"))
        except Exception:
            pass
    return values


def _get_tls_protocol(hostname: str, port: int = 443) -> str:
    """Return the TLS protocol version negotiated with the server."""
    ctx = ssl.create_default_context()
    try:
        with ctx.wrap_socket(
            socket.create_connection((hostname, port), timeout=10),
            server_hostname=hostname,
        ) as conn:
            return conn.version() or ""
    except Exception as exc:
        pytest.skip(f"TLS connection failed: {exc}")
        return ""  # unreachable


def _oidc_token_endpoint() -> str:
    return (
        f"{KEYCLOAK_URL.rstrip('/')}/realms/{KEYCLOAK_REALM}"
        "/protocol/openid-connect/token"
    )


# ---------------------------------------------------------------------------
# Shared state per scenario
# ---------------------------------------------------------------------------


class _SecurityScenarioState:
    """Mutable state bag shared between scenario steps."""

    def __init__(self) -> None:
        self.tls_host: str = ""
        self.tls_version: str = ""
        self.log_output: str = ""
        self.secret_values: list[str] = []
        self.pod_spec: dict[str, Any] = {}
        self.container_security: dict[str, Any] = {}
        self.service_account: dict[str, Any] = {}
        self.access_token: str = ""
        self.token_claims: dict[str, Any] = {}
        self.responses: list[httpx.Response] = []
        self.rate_limit_rpm: int = RATE_LIMIT_RPM


@pytest.fixture
def sec_state() -> _SecurityScenarioState:
    return _SecurityScenarioState()


# ---------------------------------------------------------------------------
# Scenario: TLS enforcement on ingress
# ---------------------------------------------------------------------------


@given("the ingress is configured with TLS")
def step_ingress_tls_configured(sec_state: _SecurityScenarioState) -> None:
    _require_kubectl()
    result = _kubectl(
        "get",
        "ingress",
        "-o",
        "json",
        check=False,
    )
    if result.returncode != 0:
        pytest.skip("No ingress resources found in namespace")
    ingresses = json.loads(result.stdout).get("items", [])
    tls_ingresses = [i for i in ingresses if i.get("spec", {}).get("tls")]
    if not tls_ingresses:
        pytest.skip("No TLS-enabled ingress found in namespace")
    # Store the first TLS host for later steps
    host = tls_ingresses[0]["spec"]["tls"][0]["hosts"][0]
    sec_state.tls_host = host


@when("I make an HTTP request to the service")
def step_make_http_request(sec_state: _SecurityScenarioState) -> None:
    host = sec_state.tls_host
    sec_state.tls_version = _get_tls_protocol(host, port=443)
    # Also attempt plain HTTP to verify redirect
    try:
        resp = httpx.get(
            f"http://{host}/api/v1/health",
            follow_redirects=False,
            timeout=10,
        )
        sec_state.responses = [resp]
    except (httpx.ConnectError, httpx.TimeoutException):
        sec_state.responses = []


@then("the connection should use TLS 1.3 or higher")
def step_tls_version(sec_state: _SecurityScenarioState) -> None:
    tls_ver = sec_state.tls_version
    supported = ("TLSv1.3",)
    assert tls_ver in supported, f"Expected TLS 1.3+, negotiated: {tls_ver}"


@then("plaintext HTTP should be redirected to HTTPS")
def step_http_redirected(sec_state: _SecurityScenarioState) -> None:
    if not sec_state.responses:
        pytest.skip("Plain HTTP endpoint unreachable — skipping redirect check")
    resp = sec_state.responses[0]
    assert resp.status_code in (
        301,
        302,
        307,
        308,
    ), f"Expected HTTP redirect, got {resp.status_code}"
    location = resp.headers.get("location", "")
    assert location.startswith(
        "https://"
    ), f"Redirect location is not HTTPS: {location!r}"


# ---------------------------------------------------------------------------
# Scenario: Kubernetes secrets are not in logs
# ---------------------------------------------------------------------------


@given("the service is running with LLM API keys configured")
def step_service_running_with_keys(sec_state: _SecurityScenarioState) -> None:
    _require_kubectl()
    sec_state.secret_values = _get_secret_values("ai-insight-secrets")
    # Truncate empty / placeholder values to avoid false positives
    sec_state.secret_values = [v for v in sec_state.secret_values if len(v) > 4]


@when("I retrieve pod logs")
def step_retrieve_pod_logs(sec_state: _SecurityScenarioState) -> None:
    sec_state.log_output = _get_pod_logs(
        f"app.kubernetes.io/name={AI_RELEASE}", tail=500
    )
    if not sec_state.log_output:
        pytest.skip("Could not retrieve pod logs — pod may not be running")


@then("no secret values should appear in the log output")
def step_no_secrets_in_logs(sec_state: _SecurityScenarioState) -> None:
    for secret_value in sec_state.secret_values:
        assert secret_value not in sec_state.log_output, (
            "A Kubernetes secret value was found in pod log output. "
            "This is a critical security violation."
        )


@then("logs should use structured JSON format")
def step_logs_json_format(sec_state: _SecurityScenarioState) -> None:
    lines = [line.strip() for line in sec_state.log_output.splitlines() if line.strip()]
    if not lines:
        pytest.skip("No log lines to validate")
    json_lines = 0
    for line in lines[:50]:  # sample first 50 lines
        try:
            json.loads(line)
            json_lines += 1
        except json.JSONDecodeError:
            pass
    json_ratio = json_lines / len(lines[:50])
    assert json_ratio >= 0.8, (
        f"Only {json_ratio:.0%} of sampled log lines are valid JSON. "
        "Expected structured JSON logging."
    )


# ---------------------------------------------------------------------------
# Scenario: Pod security context enforcement
# ---------------------------------------------------------------------------


@given("the deployment is running")
def step_deployment_running(sec_state: _SecurityScenarioState) -> None:
    _require_kubectl()
    result = _kubectl(
        "get",
        "pods",
        "-l",
        f"app.kubernetes.io/instance={SIM_RELEASE}",
        "-o",
        "json",
        check=False,
    )
    if result.returncode != 0:
        pytest.skip(
            f"Release '{SIM_RELEASE}' pods not found in namespace '{NAMESPACE}'"
        )
    pods = json.loads(result.stdout).get("items", [])
    running = [p for p in pods if p.get("status", {}).get("phase") == "Running"]
    if not running:
        pytest.skip("No Running pods found for the simulation release")
    pod = running[0]
    sec_state.pod_spec = pod.get("spec", {})
    containers = pod["spec"].get("containers", [])
    sec_state.container_security = (
        containers[0].get("securityContext", {}) if containers else {}
    )


@then("the pod should run as non-root user (UID 1000)")
def step_non_root_uid(sec_state: _SecurityScenarioState) -> None:
    pod_sc = sec_state.pod_spec.get("securityContext", {})
    run_as_non_root = pod_sc.get("runAsNonRoot", False)
    run_as_user = pod_sc.get("runAsUser", None)
    assert (
        run_as_non_root is True
    ), "runAsNonRoot is not set to true in pod security context"
    assert run_as_user == 1000, f"Expected runAsUser=1000, got {run_as_user}"


@then("the root filesystem should be read-only")
def step_readonly_fs(sec_state: _SecurityScenarioState) -> None:
    read_only = sec_state.container_security.get("readOnlyRootFilesystem", False)
    assert (
        read_only is True
    ), "readOnlyRootFilesystem is not set to true in container security context"


@then("all Linux capabilities should be dropped")
def step_capabilities_dropped(sec_state: _SecurityScenarioState) -> None:
    caps = sec_state.container_security.get("capabilities", {})
    dropped = caps.get("drop", [])
    assert "ALL" in dropped, f"Expected 'ALL' in capabilities.drop, found: {dropped}"


@then("privilege escalation should be disallowed")
def step_no_privilege_escalation(sec_state: _SecurityScenarioState) -> None:
    allow_priv_esc = sec_state.container_security.get("allowPrivilegeEscalation", True)
    assert (
        allow_priv_esc is False
    ), "allowPrivilegeEscalation is not set to false in container security context"


# ---------------------------------------------------------------------------
# Scenario: Service account restrictions
# ---------------------------------------------------------------------------


@given("the service account is created")
def step_sa_created(sec_state: _SecurityScenarioState) -> None:
    _require_kubectl()
    # Derive the SA name from the release (Helm chart uses release name)
    sa = _kubectl_get_json("serviceaccount", SIM_RELEASE)
    if not sa:
        pytest.skip(
            f"ServiceAccount '{SIM_RELEASE}' not found in namespace '{NAMESPACE}'"
        )
    sec_state.service_account = sa


@then("automountServiceAccountToken should be false")
def step_sa_no_automount(sec_state: _SecurityScenarioState) -> None:
    automount = sec_state.service_account.get("automountServiceAccountToken", True)
    assert (
        automount is False
    ), "automountServiceAccountToken is not set to false on the ServiceAccount"


@then("the service account should have minimal RBAC permissions")
def step_sa_minimal_rbac(sec_state: _SecurityScenarioState) -> None:
    sa_name = sec_state.service_account["metadata"]["name"]
    # Check for ClusterRoleBindings that grant cluster-admin or broad permissions
    result = subprocess.run(
        [
            "kubectl",
            "get",
            "clusterrolebindings",
            "-o",
            "json",
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if result.returncode != 0:
        pytest.skip("Cannot list ClusterRoleBindings — insufficient permissions")
    crbs = json.loads(result.stdout).get("items", [])
    dangerous_roles = {"cluster-admin", "admin", "edit"}
    for crb in crbs:
        role_ref = crb.get("roleRef", {}).get("name", "")
        if role_ref not in dangerous_roles:
            continue
        for subject in crb.get("subjects", []):
            if (
                subject.get("kind") == "ServiceAccount"
                and subject.get("name") == sa_name
                and subject.get("namespace") == NAMESPACE
            ):
                pytest.fail(
                    f"ServiceAccount '{sa_name}' has dangerous ClusterRoleBinding "
                    f"to role '{role_ref}'"
                )


# ---------------------------------------------------------------------------
# Scenario: Keycloak OIDC token validation
# ---------------------------------------------------------------------------


@given("Keycloak is reachable at the configured URL")
def step_keycloak_reachable(sec_state: _SecurityScenarioState) -> None:
    _require_keycloak()
    try:
        resp = httpx.get(
            f"{KEYCLOAK_URL.rstrip('/')}/realms/{KEYCLOAK_REALM}",
            timeout=10,
        )
        assert (
            resp.status_code == 200
        ), f"Keycloak realm endpoint returned {resp.status_code}"
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        pytest.skip(f"Keycloak unreachable: {exc}")


@given("a valid OIDC client is configured")
def step_oidc_client_configured() -> None:
    if not KEYCLOAK_CLIENT_ID:
        pytest.skip("KEYCLOAK_CLIENT_ID not set")
    if not KEYCLOAK_CLIENT_SECRET:
        pytest.skip("KEYCLOAK_CLIENT_SECRET not set")


@when("I request an access token with valid credentials")
def step_request_access_token(sec_state: _SecurityScenarioState) -> None:
    if not KEYCLOAK_USERNAME or not KEYCLOAK_PASSWORD:
        pytest.skip("KEYCLOAK_USERNAME / KEYCLOAK_PASSWORD not set")
    resp = httpx.post(
        _oidc_token_endpoint(),
        data={
            "grant_type": "password",
            "client_id": KEYCLOAK_CLIENT_ID,
            "client_secret": KEYCLOAK_CLIENT_SECRET,
            "username": KEYCLOAK_USERNAME,
            "password": KEYCLOAK_PASSWORD,
            "scope": "openid profile email",
        },
        timeout=15,
    )
    assert (
        resp.status_code == 200
    ), f"Token endpoint returned {resp.status_code}: {resp.text[:200]}"
    body = resp.json()
    sec_state.access_token = body.get("access_token", "")


@then("a valid JWT token should be returned")
def step_valid_jwt_returned(sec_state: _SecurityScenarioState) -> None:
    token = sec_state.access_token
    assert token, "No access_token in response body"
    parts = token.split(".")
    assert (
        len(parts) == 3
    ), f"JWT must have 3 parts (header.payload.signature), got {len(parts)}"
    # Decode payload (no signature verification — that is the server's job)
    payload_b64 = parts[1]
    # Pad to multiple of 4
    payload_b64 += "=" * (4 - len(payload_b64) % 4)
    payload_json = base64.urlsafe_b64decode(payload_b64).decode("utf-8")
    sec_state.token_claims = json.loads(payload_json)


@then("the token should contain the expected claims")
def step_token_has_expected_claims(sec_state: _SecurityScenarioState) -> None:
    claims = sec_state.token_claims
    # Standard OIDC claims that must be present
    required_claims = ["sub", "iss", "exp", "iat", "azp"]
    for claim in required_claims:
        assert (
            claim in claims
        ), f"Required JWT claim '{claim}' missing. Present claims: {list(claims.keys())}"
    # Issuer must reference our Keycloak realm
    expected_iss_fragment = f"/realms/{KEYCLOAK_REALM}"
    assert (
        expected_iss_fragment in claims["iss"]
    ), f"JWT issuer '{claims['iss']}' does not contain '{expected_iss_fragment}'"
    # Token must not be expired
    assert claims["exp"] > time.time(), "JWT token is already expired"


# ---------------------------------------------------------------------------
# Scenario: Policy-based access control
# ---------------------------------------------------------------------------


@given("the AI insight service is running")
def step_ai_service_running(sec_state: _SecurityScenarioState) -> None:
    _require_ai_service()


@given("policy enforcement is enabled")
def step_policy_enabled() -> None:
    # We infer this from the service's config; a 403 on headerless request confirms it.
    # If the service is not reachable, _require_ai_service already skipped.
    pass


@when("I make a request without required policy headers")
def step_request_without_headers(sec_state: _SecurityScenarioState) -> None:
    resp = httpx.get(
        urljoin(AI_BASE_URL, "/api/v1/insights"),
        timeout=10,
    )
    sec_state.responses = [resp]


@then("the response should be 403 Forbidden")
def step_response_403(sec_state: _SecurityScenarioState) -> None:
    assert sec_state.responses, "No response captured"
    actual = sec_state.responses[-1].status_code
    assert actual == 403, f"Expected 403 Forbidden (policy enforcement), got {actual}"


@when("I make a request with valid agreement_id and role headers")
def step_request_with_policy_headers(sec_state: _SecurityScenarioState) -> None:
    headers = {
        AGREEMENT_HEADER: AGREEMENT_ID,
        ROLE_HEADER: ROLE_VALUE,
    }
    resp = httpx.get(
        urljoin(AI_BASE_URL, "/api/v1/insights"),
        headers=headers,
        timeout=30,
    )
    sec_state.responses.append(resp)


@then("the response should be 200 OK")
def step_response_200(sec_state: _SecurityScenarioState) -> None:
    assert sec_state.responses, "No response captured"
    actual = sec_state.responses[-1].status_code
    assert actual == 200, (
        f"Expected 200 OK (policy accepted), got {actual}. "
        f"Body: {sec_state.responses[-1].text[:300]}"
    )


# ---------------------------------------------------------------------------
# Scenario: Rate limiting enforcement
# ---------------------------------------------------------------------------


@given(parsers.parse("rate limiting is set to {rpm:d} requests per minute"))
def step_rate_limit_set(rpm: int, sec_state: _SecurityScenarioState) -> None:
    sec_state.rate_limit_rpm = rpm


@when(
    parsers.parse("I send {total:d} requests within one minute from the same agreement")
)
def step_send_multiple_requests(total: int, sec_state: _SecurityScenarioState) -> None:
    _require_ai_service()
    headers = {
        AGREEMENT_HEADER: AGREEMENT_ID,
        ROLE_HEADER: ROLE_VALUE,
    }
    sec_state.responses = []
    for _ in range(total):
        try:
            resp = httpx.get(
                urljoin(AI_BASE_URL, "/api/v1/insights"),
                headers=headers,
                timeout=10,
            )
            sec_state.responses.append(resp)
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            pytest.fail(f"Request failed during rate limit test: {exc}")
        # Short pause to avoid saturating connection pool while staying within
        # the same minute window
        time.sleep(0.1)


@then(parsers.parse("the first {count:d} should return 200 OK"))
def step_first_n_return_200(count: int, sec_state: _SecurityScenarioState) -> None:
    assert (
        len(sec_state.responses) >= count
    ), f"Expected at least {count} responses, got {len(sec_state.responses)}"
    for i, resp in enumerate(sec_state.responses[:count]):
        assert (
            resp.status_code == 200
        ), f"Request {i + 1} of {count} expected 200 OK, got {resp.status_code}"


@then(parsers.parse("the {ordinal:d}th should return 429 Too Many Requests"))
def step_nth_returns_429(ordinal: int, sec_state: _SecurityScenarioState) -> None:
    idx = ordinal - 1  # zero-based
    assert (
        len(sec_state.responses) > idx
    ), f"Expected at least {ordinal} responses, got {len(sec_state.responses)}"
    actual = sec_state.responses[idx].status_code
    assert (
        actual == 429
    ), f"Request {ordinal} expected 429 Too Many Requests (rate limit), got {actual}"
    # Verify the Retry-After header is present so clients can back off properly
    retry_after = sec_state.responses[idx].headers.get("Retry-After", "")
    assert retry_after, "Rate-limited response is missing the 'Retry-After' header"
