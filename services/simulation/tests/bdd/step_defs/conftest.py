"""
BDD test configuration and fixtures.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def request_bag() -> dict:
    """Per-scenario mutable dict that BDD steps use to pass state to each
    other (base URL, last response, captured envelopes, etc.).

    Lives on the function-level scope so each scenario starts clean.
    """
    return {}
