Feature: Security and Integration
  As a security engineer
  I want to verify security controls and external integrations
  So that the system meets QA requirements

  Scenario: TLS enforcement on ingress
    Given the ingress is configured with TLS
    When I make an HTTP request to the service
    Then the connection should use TLS 1.3 or higher
    And plaintext HTTP should be redirected to HTTPS

  Scenario: Kubernetes secrets are not in logs
    Given the service is running with LLM API keys configured
    When I retrieve pod logs
    Then no secret values should appear in the log output
    And logs should use structured JSON format

  Scenario: Pod security context enforcement
    Given the deployment is running
    Then the pod should run as non-root user (UID 1000)
    And the root filesystem should be read-only
    And all Linux capabilities should be dropped
    And privilege escalation should be disallowed

  Scenario: Service account restrictions
    Given the service account is created
    Then automountServiceAccountToken should be false
    And the service account should have minimal RBAC permissions

  Scenario: Keycloak OIDC token validation
    Given Keycloak is reachable at the configured URL
    And a valid OIDC client is configured
    When I request an access token with valid credentials
    Then a valid JWT token should be returned
    And the token should contain the expected claims

  Scenario: Policy-based access control (verified token, no role header)
    Given the AI insight service is running
    And policy enforcement is enabled
    When I make a request without a bearer token
    Then the response should be 401 Unauthorized
    When I request an access token with valid credentials
    And I make a request with a valid token and scope headers
    Then the response should be 200 OK

  Scenario: Rate limiting enforcement
    Given the AI insight service is running
    And rate limiting is set to 5 requests per minute
    When I send 6 requests within one minute from the same agreement
    Then the first 5 should return 200 OK
    And the 6th should return 429 Too Many Requests
