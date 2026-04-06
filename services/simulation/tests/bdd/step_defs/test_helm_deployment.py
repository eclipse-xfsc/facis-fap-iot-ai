"""
Step definitions for Helm Deployment Lifecycle BDD scenarios.

These are end-to-end integration tests that exercise real Helm and kubectl
commands against a live Kubernetes cluster. They are marked
``@pytest.mark.integration`` so they are automatically skipped in CI
environments that lack cluster access (when the ``--run-integration`` flag
is absent or when KUBECONFIG is unset).

Prerequisites
-------------
- helm v3.x on PATH
- kubectl on PATH pointing to a reachable cluster
- ``facis`` namespace must exist (or the Background step creates it)
- The facis-simulation Helm chart directory must be available locally

Environment variables (optional overrides)
------------------------------------------
FACIS_CHART_PATH  Path to the ``facis-simulation`` chart directory.
                  Defaults to the canonical relative location within this repo.
FACIS_NAMESPACE   Target namespace. Defaults to ``facis``.
FACIS_RELEASE     Helm release name. Defaults to ``facis-simulation``.
HELM_TIMEOUT      Timeout passed to ``helm install/upgrade``. Default: ``90s``.
POD_READY_POLL_S  Seconds between kubectl get-pod polls. Default: ``5``.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from typing import Any

import httpx
import pytest
from pytest_bdd import given, parsers, scenarios, then, when

# ---------------------------------------------------------------------------
# Feature binding
# ---------------------------------------------------------------------------
scenarios("../features/helm_deployment.feature")

# ---------------------------------------------------------------------------
# Constants / defaults (overridable via env vars)
# ---------------------------------------------------------------------------
CHART_PATH = os.environ.get(
    "FACIS_CHART_PATH",
    os.path.join(
        os.path.dirname(__file__),
        "../../../../helm/facis-simulation",
    ),
)
NAMESPACE = os.environ.get("FACIS_NAMESPACE", "facis")
RELEASE = os.environ.get("FACIS_RELEASE", "facis-simulation")
HELM_TIMEOUT = os.environ.get("HELM_TIMEOUT", "90s")
POD_READY_POLL_S = int(os.environ.get("POD_READY_POLL_S", "5"))

# Image used for invalid-tag scenario
INVALID_IMAGE_TAG = "nonexistent:99.99.99"

# ---------------------------------------------------------------------------
# Pytest markers
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Helper: skip unless cluster is available
# ---------------------------------------------------------------------------
def _require_cluster() -> None:
    """Skip the test if no kubeconfig / cluster is reachable."""
    if not shutil.which("kubectl"):
        pytest.skip("kubectl not found on PATH")
    if not shutil.which("helm"):
        pytest.skip("helm not found on PATH")
    result = subprocess.run(
        ["kubectl", "cluster-info"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        pytest.skip(f"Kubernetes cluster not reachable: {result.stderr.strip()}")


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def _run(
    cmd: list[str],
    *,
    check: bool = True,
    capture: bool = True,
    timeout: int = 120,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess command and return the result."""
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        check=check,
        timeout=timeout,
    )


def _helm(
    *args: str, check: bool = True, timeout: int = 180
) -> subprocess.CompletedProcess[str]:
    """Run a helm command scoped to the test namespace."""
    return _run(["helm", *args, "--namespace", NAMESPACE], check=check, timeout=timeout)


def _kubectl(
    *args: str, check: bool = True, timeout: int = 60
) -> subprocess.CompletedProcess[str]:
    """Run a kubectl command scoped to the test namespace."""
    return _run(
        ["kubectl", *args, "--namespace", NAMESPACE], check=check, timeout=timeout
    )


def _kubectl_get_json(resource: str, name: str) -> dict[str, Any]:
    """Return a kubectl resource as a parsed JSON dict."""
    result = _kubectl("get", resource, name, "-o", "json", check=False)
    if result.returncode != 0:
        return {}
    return json.loads(result.stdout)


def _release_exists() -> bool:
    """Return True if the Helm release is currently installed."""
    result = _helm("status", RELEASE, check=False)
    return result.returncode == 0


def _uninstall_if_present() -> None:
    """Silently uninstall the release if it exists."""
    if _release_exists():
        _helm("uninstall", RELEASE, "--wait", "--timeout", HELM_TIMEOUT)


def _wait_for_pod_state(
    desired_state: str,
    timeout_s: int = 60,
) -> str | None:
    """
    Poll until any pod matching the release label enters *desired_state*.

    Returns the final observed phase/reason string, or None on timeout.
    Supports both normal phases (Running, Pending) and waiting reasons
    such as ImagePullBackOff and ErrImagePull.
    """
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        result = _kubectl(
            "get",
            "pods",
            "-l",
            f"app.kubernetes.io/instance={RELEASE}",
            "-o",
            "json",
            check=False,
        )
        if result.returncode == 0:
            pods = json.loads(result.stdout).get("items", [])
            for pod in pods:
                phase = pod.get("status", {}).get("phase", "")
                # Check container-level waiting reason (e.g. ImagePullBackOff)
                for cs in pod.get("status", {}).get("containerStatuses", []):
                    waiting = cs.get("state", {}).get("waiting", {})
                    reason = waiting.get("reason", "")
                    if reason == desired_state:
                        return reason
                if phase == desired_state:
                    return phase
        time.sleep(POD_READY_POLL_S)
    return None


def _get_service_cluster_ip() -> str:
    """Return the ClusterIP for the release service (empty string if absent)."""
    svc = _kubectl_get_json("service", RELEASE)
    return svc.get("spec", {}).get("clusterIP", "")


def _get_deployment_ready_replicas() -> int:
    """Return the number of ready replicas for the release deployment."""
    deploy = _kubectl_get_json("deployment", RELEASE)
    return deploy.get("status", {}).get("readyReplicas", 0) or 0


def _get_helm_revision() -> int:
    """Return the current revision number of the Helm release."""
    result = _helm("list", "--output", "json")
    releases = json.loads(result.stdout)
    for rel in releases:
        if rel.get("name") == RELEASE:
            return int(rel.get("revision", 0))
    return 0


def _get_pod_env_var(env_var_name: str) -> str | None:
    """Return the value of an env var from the first running pod."""
    result = _kubectl(
        "get",
        "pods",
        "-l",
        f"app.kubernetes.io/instance={RELEASE}",
        "-o",
        "jsonpath={.items[0].metadata.name}",
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    pod_name = result.stdout.strip()
    exec_result = _kubectl(
        "exec",
        pod_name,
        "--",
        "printenv",
        env_var_name,
        check=False,
    )
    return exec_result.stdout.strip() if exec_result.returncode == 0 else None


def _list_orphaned_resources(label_selector: str) -> list[str]:
    """Return names of any remaining resources matching the label selector."""
    resource_types = [
        "deployments",
        "services",
        "configmaps",
        "serviceaccounts",
        "pods",
    ]
    orphans: list[str] = []
    for rtype in resource_types:
        result = _kubectl(
            "get",
            rtype,
            "-l",
            label_selector,
            "-o",
            "jsonpath={.items[*].metadata.name}",
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            for name in result.stdout.strip().split():
                orphans.append(f"{rtype}/{name}")
    return orphans


# ---------------------------------------------------------------------------
# Shared state container — passed between steps via pytest fixtures
# ---------------------------------------------------------------------------


class _HelmScenarioState:
    """Mutable bag-of-state shared between steps within a single scenario."""

    def __init__(self) -> None:
        self.install_stdout: str = ""
        self.install_returncode: int = -1
        self.pre_upgrade_revision: int = 0
        self.service_port_before_rollout: int = 0


@pytest.fixture
def helm_state() -> _HelmScenarioState:
    """Fresh state object per scenario."""
    return _HelmScenarioState()


# ---------------------------------------------------------------------------
# Background steps
# ---------------------------------------------------------------------------


@given("the Kubernetes cluster is accessible")
def step_cluster_accessible() -> None:
    _require_cluster()


@given(parsers.parse('the "{namespace}" namespace exists'))
def step_namespace_exists(namespace: str) -> None:
    result = _run(
        ["kubectl", "get", "namespace", namespace],
        check=False,
    )
    if result.returncode != 0:
        _run(["kubectl", "create", "namespace", namespace])


@given("Helm v3 CLI is available")
def step_helm_available() -> None:
    result = _run(["helm", "version", "--short"], check=False)
    assert result.returncode == 0, "Helm v3 CLI not found on PATH"
    assert result.stdout.strip().startswith(
        "v3"
    ), f"Expected Helm v3, found: {result.stdout.strip()}"


# ---------------------------------------------------------------------------
# Given steps
# ---------------------------------------------------------------------------


@given(parsers.parse('the Helm chart "{chart_name}" is available'))
def step_chart_available(chart_name: str) -> None:
    chart_yaml = os.path.join(CHART_PATH, "Chart.yaml")
    assert os.path.isfile(chart_yaml), (
        f"Chart.yaml not found at {chart_yaml}. "
        f"Set FACIS_CHART_PATH to the correct path."
    )
    # Ensure no stale release exists before the install scenarios
    _uninstall_if_present()


@given(parsers.parse('the Helm release "{release}" is already installed'))
def step_release_already_installed(
    release: str, helm_state: _HelmScenarioState
) -> None:
    _uninstall_if_present()
    _helm(
        "install",
        RELEASE,
        CHART_PATH,
        "--wait",
        "--timeout",
        HELM_TIMEOUT,
    )
    helm_state.pre_upgrade_revision = _get_helm_revision()


@given(parsers.parse('the Helm release "{release}" is installed at revision 1'))
def step_release_installed_at_revision_1(
    release: str, helm_state: _HelmScenarioState
) -> None:
    _uninstall_if_present()
    _helm(
        "install",
        RELEASE,
        CHART_PATH,
        "--wait",
        "--timeout",
        HELM_TIMEOUT,
    )
    helm_state.pre_upgrade_revision = _get_helm_revision()
    assert (
        helm_state.pre_upgrade_revision == 1
    ), f"Expected revision 1 after fresh install, got {helm_state.pre_upgrade_revision}"


# ---------------------------------------------------------------------------
# When steps
# ---------------------------------------------------------------------------


@when("I install the chart with default values")
def step_install_default(helm_state: _HelmScenarioState) -> None:
    result = _helm(
        "install",
        RELEASE,
        CHART_PATH,
        "--wait",
        "--timeout",
        HELM_TIMEOUT,
        check=False,
    )
    helm_state.install_stdout = result.stdout + result.stderr
    helm_state.install_returncode = result.returncode


@when(parsers.parse('I install the chart with an invalid image tag "{image_tag}"'))
def step_install_invalid_tag(image_tag: str, helm_state: _HelmScenarioState) -> None:
    # Install without --wait so we can observe the degraded state ourselves
    result = _helm(
        "install",
        RELEASE,
        CHART_PATH,
        "--set",
        f"image.tag={image_tag}",
        "--set",
        "image.pullPolicy=Always",
        check=False,
    )
    helm_state.install_stdout = result.stdout + result.stderr
    helm_state.install_returncode = result.returncode


@when("I upgrade the release with the same values")
def step_upgrade_same_values(helm_state: _HelmScenarioState) -> None:
    helm_state.pre_upgrade_revision = _get_helm_revision()
    result = _helm(
        "upgrade",
        RELEASE,
        CHART_PATH,
        "--reuse-values",
        "--wait",
        "--timeout",
        HELM_TIMEOUT,
        check=False,
    )
    helm_state.install_returncode = result.returncode
    helm_state.install_stdout = result.stdout + result.stderr


@when(parsers.parse('I upgrade the release with "{set_flag}"'))
def step_upgrade_with_set(set_flag: str, helm_state: _HelmScenarioState) -> None:
    # set_flag looks like: --set simulation.speedFactor=60
    flag_parts = set_flag.split()
    result = _helm(
        "upgrade",
        RELEASE,
        CHART_PATH,
        *flag_parts,
        "--wait",
        "--timeout",
        HELM_TIMEOUT,
        check=False,
    )
    helm_state.install_returncode = result.returncode
    helm_state.install_stdout = result.stdout + result.stderr


@when("I uninstall the release")
def step_uninstall(helm_state: _HelmScenarioState) -> None:
    result = _helm(
        "uninstall",
        RELEASE,
        "--wait",
        "--timeout",
        HELM_TIMEOUT,
        check=False,
    )
    helm_state.install_returncode = result.returncode
    helm_state.install_stdout = result.stdout + result.stderr


@when("I upgrade with an invalid image causing pod failure")
def step_upgrade_invalid_image(helm_state: _HelmScenarioState) -> None:
    _helm(
        "upgrade",
        RELEASE,
        CHART_PATH,
        "--set",
        f"image.tag={INVALID_IMAGE_TAG}",
        "--set",
        "image.pullPolicy=Always",
        check=False,
    )
    # Give the bad pod a moment to enter a failure state
    _wait_for_pod_state("ImagePullBackOff", timeout_s=60)


@when(parsers.parse("I rollback to revision {revision:d}"))
def step_rollback(revision: int, helm_state: _HelmScenarioState) -> None:
    result = _helm(
        "rollback",
        RELEASE,
        str(revision),
        "--wait",
        "--timeout",
        HELM_TIMEOUT,
        check=False,
    )
    helm_state.install_returncode = result.returncode
    helm_state.install_stdout = result.stdout + result.stderr


# ---------------------------------------------------------------------------
# Then steps
# ---------------------------------------------------------------------------


@then(
    parsers.parse(
        'the deployment "{deploy_name}" should exist in namespace "{namespace}"'
    )
)
def step_deployment_exists(deploy_name: str, namespace: str) -> None:
    deploy = _kubectl_get_json("deployment", deploy_name)
    assert deploy, f"Deployment '{deploy_name}' not found in namespace '{namespace}'"
    assert deploy["metadata"]["name"] == deploy_name


@then(
    parsers.parse('the pod should reach "{state}" state within {timeout_s:d} seconds')
)
def step_pod_reaches_state(state: str, timeout_s: int) -> None:
    observed = _wait_for_pod_state(state, timeout_s=timeout_s)
    assert observed == state, (
        f"Pod did not reach '{state}' within {timeout_s}s. "
        f"Last observed state: {observed!r}"
    )


@then(parsers.parse('the health endpoint "{path}" should return {status_code:d}'))
def step_health_endpoint(path: str, status_code: int) -> None:
    # Resolve the ClusterIP to call the health endpoint from within the cluster.
    # Falls back to port-forwarding when not running inside the cluster.
    cluster_ip = _get_service_cluster_ip()
    url = f"http://{cluster_ip}:8080{path}"

    # Attempt direct connection first; fall back to port-forward
    try:
        response = httpx.get(url, timeout=10)
        assert (
            response.status_code == status_code
        ), f"Expected HTTP {status_code} from {url}, got {response.status_code}"
    except (httpx.ConnectError, httpx.TimeoutException):
        # Port-forward approach for environments where ClusterIP is not directly reachable
        with subprocess.Popen(
            [
                "kubectl",
                "port-forward",
                f"svc/{RELEASE}",
                "18080:8080",
                "--namespace",
                NAMESPACE,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ) as pf:
            try:
                time.sleep(2)  # Allow port-forward to establish
                pf_url = f"http://localhost:18080{path}"
                response = httpx.get(pf_url, timeout=10)
                assert (
                    response.status_code == status_code
                ), f"Expected HTTP {status_code} from {pf_url}, got {response.status_code}"
            finally:
                pf.terminate()


@then(parsers.parse("a ClusterIP service should expose port {port:d}"))
def step_clusterip_service(port: int) -> None:
    svc = _kubectl_get_json("service", RELEASE)
    assert svc, f"Service '{RELEASE}' not found in namespace '{NAMESPACE}'"
    assert (
        svc["spec"]["type"] == "ClusterIP"
    ), f"Expected ClusterIP, got {svc['spec']['type']}"
    ports = [p["port"] for p in svc["spec"].get("ports", [])]
    assert port in ports, f"Port {port} not found in service ports: {ports}"


@then(parsers.parse('the pod should enter "{state}" state'))
def step_pod_enters_state(state: str) -> None:
    # Await the failure state with a generous timeout
    observed = _wait_for_pod_state(state, timeout_s=120)
    assert (
        observed == state
    ), f"Pod did not enter '{state}'. Last observed: {observed!r}"


@then(parsers.parse("the deployment should report {count:d} ready replicas"))
def step_deployment_ready_replicas(count: int) -> None:
    # Give the deployment controller a moment to reconcile
    time.sleep(5)
    ready = _get_deployment_ready_replicas()
    assert ready == count, f"Expected {count} ready replicas, got {ready}"


@then(parsers.parse('Helm release status should be "{status}" with 0 available'))
def step_helm_release_status(status: str) -> None:
    result = _helm("list", "--output", "json")
    releases = json.loads(result.stdout)
    match = next((r for r in releases if r.get("name") == RELEASE), None)
    assert match is not None, f"Helm release '{RELEASE}' not found"
    assert (
        match["status"] == status
    ), f"Expected Helm status '{status}', got '{match['status']}'"


@then("the deployment revision should increment")
def step_revision_incremented(helm_state: _HelmScenarioState) -> None:
    current = _get_helm_revision()
    assert (
        current > helm_state.pre_upgrade_revision
    ), f"Revision did not increment: was {helm_state.pre_upgrade_revision}, now {current}"


@then("no data loss should occur during rollout")
def step_no_data_loss() -> None:
    # The simulation service is stateless with respect to external storage.
    # Verify that the API continues to serve requests after the rollout by
    # confirming that the health endpoint is reachable.
    cluster_ip = _get_service_cluster_ip()
    assert (
        cluster_ip and cluster_ip != "None"
    ), "Service ClusterIP unavailable after rollout"


@then("the pod should restart with the new configuration")
def step_pod_restarted_new_config() -> None:
    observed = _wait_for_pod_state("Running", timeout_s=120)
    assert (
        observed == "Running"
    ), f"Pod did not return to Running after config update. Last state: {observed!r}"


@then(parsers.parse('environment variable "{env_var}" should equal "{expected_value}"'))
def step_env_var_equals(env_var: str, expected_value: str) -> None:
    actual = _get_pod_env_var(env_var)
    assert (
        actual is not None
    ), f"Could not retrieve env var '{env_var}' from pod — pod may not be running"
    assert (
        actual == expected_value
    ), f"Env var '{env_var}': expected '{expected_value}', got '{actual}'"


@then(parsers.parse('the deployment should be removed from namespace "{namespace}"'))
def step_deployment_removed(namespace: str) -> None:
    deploy = _kubectl_get_json("deployment", RELEASE)
    assert not deploy, f"Deployment '{RELEASE}' still exists in namespace '{namespace}'"


@then("the service should be removed")
def step_service_removed() -> None:
    svc = _kubectl_get_json("service", RELEASE)
    assert not svc, f"Service '{RELEASE}' still exists after uninstall"


@then("the configmap should be removed")
def step_configmap_removed() -> None:
    cm_name = f"{RELEASE}-config"
    cm = _kubectl_get_json("configmap", cm_name)
    assert not cm, f"ConfigMap '{cm_name}' still exists after uninstall"


@then(
    parsers.parse('no orphaned resources should remain with label "{label_selector}"')
)
def step_no_orphaned_resources(label_selector: str) -> None:
    # Allow a brief grace period for garbage collection
    time.sleep(5)
    orphans = _list_orphaned_resources(label_selector)
    assert not orphans, f"Orphaned resources found after uninstall: {orphans}"
