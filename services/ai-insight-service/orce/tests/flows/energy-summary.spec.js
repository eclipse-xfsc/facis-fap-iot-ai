"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonFromOrce } = require("./helpers/io");
const { validateEnergyRequest } = require("./helpers/validation");

test("energy validation accepts strict_daily and fallback_hourly", () => {
    const base = {
        start_ts: "2026-03-01T00:00:00Z",
        end_ts: "2026-03-02T00:00:00Z",
        forecast_alpha: 0.6,
        trend_epsilon: 0.02,
    };
    const strict = validateEnergyRequest({ ...base, daily_overview_strategy: "strict_daily" });
    const fallback = validateEnergyRequest({ ...base, daily_overview_strategy: "fallback_hourly" });
    assert.equal(strict.ok, true);
    assert.equal(fallback.ok, true);
});

test("energy validation rejects invalid alpha, epsilon and strategy", () => {
    const base = {
        start_ts: "2026-03-01T00:00:00Z",
        end_ts: "2026-03-02T00:00:00Z",
    };
    assert.equal(validateEnergyRequest({ ...base, forecast_alpha: 0 }).detail, "forecast_alpha must be within (0, 1]");
    assert.equal(validateEnergyRequest({ ...base, trend_epsilon: -1 }).detail, "trend_epsilon must be >= 0");
    assert.equal(
        validateEnergyRequest({ ...base, daily_overview_strategy: "invalid" }).detail,
        "daily_overview_strategy must be strict_daily or fallback_hourly",
    );
});

test("energy flow includes required route and response nodes", () => {
    const flow = readJsonFromOrce("flows/ai-insight-energy-summary.json");
    const route = flow.find(
        (n) =>
            n.type === "http in" &&
            n.url === "/api/v1/insights/energy-summary" &&
            n.method === "post",
    );
    assert.ok(route);
    const names = flow.filter((n) => n.type === "http response").map((n) => n.name);
    assert.ok(names.includes("Energy 200 JSON"));
    assert.ok(names.includes("Energy 400 JSON"));
    assert.ok(names.includes("Energy 403 JSON"));
    assert.ok(names.includes("Energy 429 JSON"));
    assert.ok(names.includes("Energy 502 JSON"));
});
