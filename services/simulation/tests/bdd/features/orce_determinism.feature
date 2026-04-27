Feature: ORCE-native simulation runtime — internal determinism
  As an integration engineer
  I want the ORCE-native simulation engine to be reproducible across runs
  So that BDD assertions on numeric output remain stable

  Note:
    The ORCE-native engine uses a JS-native seedrandom('alea') PRNG seeded via
    SHA-256 truncation. Output sequences are NOT byte-identical to the legacy
    Python (numpy PCG64) sequences — that is a documented controlled break.
    This feature verifies internal determinism, not parity with legacy Python.

  Background:
    Given compatibilityMode is "orce"
    And the entity registry is the chart default (2 meters, 2 PV systems, 2 consumers)

  Scenario: Same seed produces identical envelopes across two runs
    Given seed "12345" and simulation start time "2024-06-15T12:00:00Z"
    When I run the simulation for 60 ticks at speed_factor 60
    And I capture the resulting envelope from the Kafka topic for each tick
    And I reset and replay with the same seed and start time
    Then the captured envelope sequences are byte-identical between the two runs

  Scenario: Different seed produces a different envelope sequence
    Given seed "12345" for run A and seed "99999" for run B
    When I run each for 60 ticks at the same start time
    Then the envelope sequences differ within the first 5 ticks

  Scenario: Cumulative energy is monotonic across a 24-hour run
    Given seed "12345" and a 24-hour window
    When I run the simulation at speed_factor 60
    Then for every meter the field "readings.total_energy_kwh" never decreases
    And the final value is greater than the initial value

  Scenario: Weather → PV correlation is preserved
    Given seed "12345" and simulation time set to a clear summer noon
    When I run for 1 tick
    Then the weather feed reports "conditions.ghi_w_m2" > 100
    And every PV reading has "readings.power_output_kw" > 0
    When I advance to midnight
    Then every PV reading has "readings.power_output_kw" = 0
