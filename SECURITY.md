# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in this monorepo, please report it responsibly.

**Do not open a public issue for security vulnerabilities.**

Instead, please report vulnerabilities through the Eclipse Foundation's security process:

- **Email:** security@eclipse.org
- **Eclipse Security Page:** https://www.eclipse.org/security/

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if available)
- Affected service(s)

## Supported Versions

| Service | Version | Supported |
|---|---|---|
| Simulation | 1.0.x | Yes |
| AI Insight Service | 0.1.x | Yes |
| AI Insight UI | 0.1.x | Yes |

## Service Security References

Each service maintains its own detailed security documentation:

- [Simulation Service](services/simulation/SECURITY.md)
- [AI Insight Service](services/ai-insight-service/SECURITY.md)
- [AI Insight UI](services/ai-insight-ui/SECURITY.md)

## General Security Principles

This monorepo implements the following cross-cutting security practices:

- **Authentication:** Keycloak OIDC for user authentication across all services
- **Service Communication:** mTLS for service-to-service communication
- **Container Security:** All Docker images run as non-root users
- **Secrets Management:** Sensitive credentials stored in Kubernetes Secrets, not ConfigMaps
- **Dependency Scanning:** Regular updates via `pip audit` (Python), `npm audit` (JavaScript), and Eclipse Dash (license compliance)
- **Transport Security:** TLS/mTLS for all external and internal communication
