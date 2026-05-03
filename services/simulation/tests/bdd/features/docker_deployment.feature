Feature: Container Deployment
  As a DevOps engineer
  I want containerized deployment of the simulation image
  So that the same artefact runs consistently in CI, staging, and production
  #
  # Per the FACIS Technical Development Requirements ("No Docker Compose
  # permitted"), multi-service orchestration is performed exclusively via
  # Helm and Kubernetes — see helm_deployment.feature. The scenarios below
  # validate the Docker IMAGE (build, env-driven config, volume mount), not
  # any compose-based topology.

  Scenario: Container startup
    Given the Docker image is built
    When I run the container with default configuration
    Then all simulation services should start within 30 seconds
    And health check endpoint should return 200 OK

  Scenario: Configuration via environment variables
    Given environment variable SIMULATION_SEED=54321
    And environment variable TIME_ACCELERATION=10
    When I start the container
    Then simulation should use the specified seed
    And time should be accelerated 10x

  Scenario: Volume mounting for data persistence
    Given a volume mounted at /data
    When simulation generates data
    Then data should be persisted to the volume
    And data should survive container restart
