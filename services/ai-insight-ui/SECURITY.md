# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public issue for security vulnerabilities.**

Instead, please report vulnerabilities through the Eclipse Foundation's security process:

- **Email:** security@eclipse.org
- **Eclipse Security Page:** https://www.eclipse.org/security/

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if available)

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Security Considerations

This project provides a browser-based UI for AI insights and energy data visualization. Key security measures include:

- **Transport Security:** HTTPS for browser connections; mTLS between UI backend and ORCE/AI services
- **Authentication:** Keycloak OIDC (PKCE flow) for user authentication; token refresh handled securely
- **Credential Management:** LLM API keys and OIDC secrets stored in Kubernetes Secrets, not ConfigMaps
- **Container Security:** Nginx reverse proxy runs as non-root user; ORCE pod follows platform security context
- **Dependency Scanning:** Regular updates via `npm audit` and Dependabot; TypeScript type checking enforced
