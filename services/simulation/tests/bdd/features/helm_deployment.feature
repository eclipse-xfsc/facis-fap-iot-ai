Feature: Helm Deployment Lifecycle
  As a DevOps engineer
  I want automated Helm-based deployment
  So that services deploy, redeploy, and uninstall with zero manual intervention

  Background:
    Given the Kubernetes cluster is accessible
    And the "facis" namespace exists
    And Helm v3 CLI is available

  Scenario: Successful initial deployment
    Given the Helm chart "facis-simulation" is available
    When I install the chart with default values
    Then the deployment "facis-simulation" should exist in namespace "facis"
    And the pod should reach "Running" state within 60 seconds
    And the health endpoint "/api/v1/health" should return 200
    And a ClusterIP service should expose port 8080

  Scenario: Deployment with invalid parameters
    Given the Helm chart "facis-simulation" is available
    When I install the chart with an invalid image tag "nonexistent:99.99.99"
    Then the pod should enter "ImagePullBackOff" state
    And the deployment should report 0 ready replicas
    And Helm release status should be "deployed" with 0 available

  Scenario: Idempotent redeployment
    Given the Helm release "facis-simulation" is already installed
    When I upgrade the release with the same values
    Then the deployment revision should increment
    And the pod should reach "Running" state within 60 seconds
    And the health endpoint "/api/v1/health" should return 200
    And no data loss should occur during rollout

  Scenario: Configuration update via Helm upgrade
    Given the Helm release "facis-simulation" is already installed
    When I upgrade the release with "--set simulation.speedFactor=60"
    Then the pod should restart with the new configuration
    And environment variable "SIMULATOR_SIMULATION__SPEED_FACTOR" should equal "60"

  Scenario: Clean uninstall
    Given the Helm release "facis-simulation" is already installed
    When I uninstall the release
    Then the deployment should be removed from namespace "facis"
    And the service should be removed
    And the configmap should be removed
    And no orphaned resources should remain with label "app.kubernetes.io/instance=facis-simulation"

  Scenario: Rollback after failed upgrade
    Given the Helm release "facis-simulation" is installed at revision 1
    When I upgrade with an invalid image causing pod failure
    And I rollback to revision 1
    Then the pod should reach "Running" state within 60 seconds
    And the health endpoint "/api/v1/health" should return 200
