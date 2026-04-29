"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonFromOrce } = require("./helpers/io");
const { validateCityRequest } = require("./helpers/validation");

test("city validation accepts valid payload and defaults timezone", () => {
    const result = validateCityRequest({
        start_ts: "2026-03-01T00:00:00Z",
        end_ts: "2026-03-02T00:00:00Z",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.timezone, "UTC");
    assert.equal(result.value.include_data, false);
});

test("city validation rejects malformed json and invalid window", () => {
    const invalidJson = validateCityRequest("{not-json");
    assert.equal(invalidJson.ok, false);
    assert.equal(invalidJson.detail, "Request body must be valid JSON");

    const invalidWindow = validateCityRequest({
        start_ts: "2026-03-03T00:00:00Z",
        end_ts: "2026-03-02T00:00:00Z",
    });
    assert.equal(invalidWindow.ok, false);
    assert.equal(invalidWindow.detail, "start_ts must be earlier than end_ts");
});

test("city flow includes expected route and status responses", () => {
    const flow = readJsonFromOrce("flows/ai-insight-city-status.json");
    const route = flow.find(
        (n) => n.type === "http in" && n.url === "/api/v1/insights/city-status" && n.method === "post",
    );
    assert.ok(route);
    const names = flow.filter((n) => n.type === "http response").map((n) => n.name);
    assert.ok(names.includes("City 200 JSON"));
    assert.ok(names.includes("City 400 JSON"));
    assert.ok(names.includes("City 403 JSON"));
    assert.ok(names.includes("City 429 JSON"));
    assert.ok(names.includes("City 502 JSON"));
});
