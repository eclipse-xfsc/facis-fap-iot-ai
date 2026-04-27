Feature: ORCE-native simulation runtime — observability
  As an SRE
  I want Prometheus metrics and structured JSON logs from the ORCE pod
  So that I can monitor simulation health independent of the runtime

  Background:
    Given compatibilityMode is "orce"
    And the simulation has been running for at least 5 ticks

  Scenario: Prometheus /metrics endpoint exposes the canonical counter set
    When I GET "/metrics" on the ORCE HTTP endpoint
    Then the response status is 200
    And the body contains a "# TYPE facis_sim_ticks_total counter" line
    And the body contains a "# TYPE facis_kafka_messages_sent_total counter" line
    And the body contains a "# TYPE facis_mqtt_messages_sent_total counter" line
    And the body contains a "# TYPE facis_modbus_requests_total counter" line

  Scenario: Counters increment as the simulation produces ticks
    Given I record the current value of "facis_sim_ticks_total"
    When the simulation produces 3 more ticks
    Then a follow-up scrape of "facis_sim_ticks_total" is at least 3 higher than the recorded value

  Scenario: Errors land in the dead-letter Kafka topic with structured fields
    When the feeds tab emits a malformed envelope (e.g. missing "site_id")
    Then a record appears on Kafka topic "sim.dead_letter" within 5 seconds
    And the record body parses as JSON with keys "timestamp", "level", "service", "message"
    And the field "service" equals "facis-simulation-orce"

  Scenario: stdout logs are JSON-formatted
    When I tail the ORCE pod logs for 10 seconds
    Then every log line that starts with "{" parses as JSON
    And contains keys "timestamp" and "level"
    And does not contain any of the substrings "password", "secret", "token", "api_key"
