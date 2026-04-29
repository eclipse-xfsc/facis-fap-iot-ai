"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonFromOrce } = require("./helpers/io");
const { validateAnomalyRequest } = require("./helpers/validation");

test("anomaly request validation accepts valid payload with defaults", () => {
    const result = validateAnomalyRequest({
        start_ts: "2026-03-01T00:00:00Z",
        end_ts: "2026-03-02T00:00:00Z",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.timezone, "UTC");
    assert.equal(result.value.robust_z_threshold, 3.5);
    assert.equal(result.value.include_data, false);
});

test("anomaly request validation rejects invalid windows and threshold", () => {
    assert.equal(
        validateAnomalyRequest({ start_ts: "x", end_ts: "2026-03-02T00:00:00Z" }).detail,
        "start_ts and end_ts must be valid timestamps",
    );
    assert.equal(
        validateAnomalyRequest({ start_ts: "2026-03-03T00:00:00Z", end_ts: "2026-03-02T00:00:00Z" }).detail,
        "start_ts must be earlier than end_ts",
    );
    assert.equal(
        validateAnomalyRequest({
            start_ts: "2026-03-01T00:00:00Z",
            end_ts: "2026-03-02T00:00:00Z",
            robust_z_threshold: 0,
        }).detail,
        "robust_z_threshold must be greater than zero",
    );
});

test("anomaly flow keeps expected route and guard responses", () => {
    const flow = readJsonFromOrce("flows/ai-insight-anomaly.json");
    const route = flow.find(
        (n) =>
            n.type === "http in" &&
            n.url === "/api/v1/insights/anomaly-report" &&
            n.method === "post",
    );
    assert.ok(route);

    const names = flow.filter((n) => n.type === "http response").map((n) => n.name);
    assert.ok(names.includes("Anomaly 200 JSON"));
    assert.ok(names.includes("Anomaly 400 JSON"));
    assert.ok(names.includes("Anomaly 403 JSON"));
    assert.ok(names.includes("Anomaly 429 JSON"));
    assert.ok(names.includes("Anomaly 502 JSON"));
});
