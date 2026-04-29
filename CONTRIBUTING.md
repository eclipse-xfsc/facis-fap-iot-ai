# Contributing to FACIS FAP IoT & AI

Thank you for your interest in contributing to the FACIS project. This document provides
guidelines for contributing to the IoT & AI Federated Architecture Pattern (FAP) monorepo.

## Eclipse Contributor Agreement

Before your contribution can be accepted, you must complete the
[Eclipse Contributor Agreement (ECA)](https://www.eclipse.org/legal/ECA.php) version 3.1.0 or higher.
This is a one-time process for all Eclipse Foundation projects.

All work must be done in compliance with the Eclipse Contributor Agreement. See:
https://www.eclipse.org/legal/ECA.php

## Repository Structure

This is a monorepo containing multiple services:

| Service | Path | Description |
|---------|------|-------------|
| Simulation | `services/simulation/` | Deterministic IoT simulation service |
| AI Insight Service | `services/ai-insight-service/` | FastAPI backend for governed AI insights |
| AI Insight UI | `services/ai-insight-ui/` | Vue.js + UIBUILDER frontend dashboard |

## Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd facis-fap-iot-ai

# Set up a specific service (e.g., simulation)
cd services/simulation
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Run linting
ruff check src/ tests/
black --check src/ tests/
mypy src/
```

## Code Standards

- **Language:** Python 3.11+ for backend services
- **Style:** Enforced via `ruff` (line length 100) and `black`
- **Type Checking:** `mypy` (non-strict, ignore missing imports)
- **Testing:** `pytest` with `pytest-bdd` for BDD scenarios
- **Coverage Target:** > 80%
- **License:** All code must be compatible with Apache License 2.0

## Submitting Changes

1. Create a feature branch from `main`
2. Write tests for new functionality (unit + BDD where applicable)
3. Ensure all tests pass: `pytest tests/ -v`
4. Ensure linting passes: `ruff check src/ tests/`
5. Submit a pull request with a clear description of the change
6. Ensure CI checks pass (GitHub Actions)

## Commit Guidelines

- Code and content must be committed daily
- All code, Node.js logic, UI schemas, Helm charts, and scripts must reside in this repository
- No parallel private repositories are allowed

## Reporting Issues

Use the project's issue tracker. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (Python version, OS, Kubernetes version)

## License Compliance

- All third-party dependencies must use [Eclipse-approved licenses](https://www.eclipse.org/legal/licenses.php#approved)
- Only FOSS code compatible with Apache License 2.0 is allowed
- Any exceptions must be documented

## Code of Conduct

This project follows the [Eclipse Foundation Community Code of Conduct](https://www.eclipse.org/org/documents/Community_Code_of_Conduct.php).

## License

By contributing, you agree that your contributions will be licensed under the
Apache License 2.0, as described in the [LICENSE](LICENSE) file.
