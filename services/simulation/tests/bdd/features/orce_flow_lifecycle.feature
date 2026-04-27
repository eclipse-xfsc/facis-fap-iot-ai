Feature: ORCE-native simulation runtime — lifecycle & control plane
  As an operator running the FACIS simulation through ORCE
  I want REST and protocol behaviour to match the legacy Python service
  So that downstream consumers (Kafka, MQTT, Modbus, Trino) keep working

  Background:
    Given an ORCE pod with the simulation flows imported via the Helm post-install Job
    And compatibilityMode is "orce"

  Scenario: Engine boots in INITIALIZED state
    When I GET "/api/v1/simulation/status" on the ORCE HTTP endpoint
    Then the response status is 200
    And the JSON body has key "state" with value "initialized"
    And the JSON body has keys "simulation_time", "seed", "acceleration", "registered_entities"

  Scenario: Start transitions to RUNNING
    When I POST "/api/v1/simulation/start" with body '{"start_time": null}'
    Then the response JSON has "status" = "started"
    And a follow-up GET "/api/v1/simulation/status" returns "state" = "running"

  Scenario: Pause transitions to PAUSED
    Given the simulation has been started
    When I POST "/api/v1/simulation/pause"
    Then the response JSON has "status" = "paused"
    And a follow-up GET "/api/v1/simulation/status" returns "state" = "paused"

  Scenario: Reset returns to INITIALIZED with new seed
    When I POST "/api/v1/simulation/reset" with body '{"seed": 99999}'
    Then the response JSON has "status" = "reset"
    And the response JSON has "seed" = 99999
    And a follow-up GET "/api/v1/simulation/status" returns "state" = "initialized"

  Scenario: REST snapshot endpoints reflect the latest tick
    Given the simulation has been running for at least 2 ticks
    When I GET "/api/v1/meters"
    Then the response is a JSON array of meter readings
    And every reading has fields "meter_id" and "readings.total_energy_kwh"
    When I GET "/api/v1/weather"
    Then the response JSON has key "conditions.ghi_w_m2"
    When I GET "/api/v1/pv"
    Then the response is a JSON array with "readings.power_output_kw"

  Scenario: State persistence survives a flow re-import
    Given the simulation has been running for at least 5 ticks
    When I trigger a flow re-import via the ORCE Admin API
    Then the engine state file at "/data/sim-state/state.json" remains
    And a follow-up GET "/api/v1/simulation/status" reflects the prior state
