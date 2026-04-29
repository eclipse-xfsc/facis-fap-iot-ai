"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonFromOrce } = require("./helpers/io");
const { assertOpenApiShape, assertRequiredPaths } = require("./helpers/openapi");

function getNode(flow, name) {
    return flow.find((n) => n.type === "function" && n.name === name);
}

test("openapi flow exposes /openapi.json, /docs and /redoc routes", () => {
    const flow = readJsonFromOrce("flows/ai-insight-openapi.json");
    const routeTriples = flow
        .filter((n) => n.type === "http in")
        .map((n) => `${n.method}:${n.url}`);
    assert.ok(routeTriples.includes("get:/openapi.json"));
    assert.ok(routeTriples.includes("get:/docs"));
    assert.ok(routeTriples.includes("get:/redoc"));
});

test("openapi function includes required endpoint schemas and daily strategy enum docs", () => {
    const flow = readJsonFromOrce("flows/ai-insight-openapi.json");
    const fn = getNode(flow, "BuildOpenApiSpec");
    assert.ok(fn);
    assert.ok(fn.func.includes("/api/v1/insights/energy-summary"));
    assert.ok(fn.func.includes("/api/v1/insights/anomaly-report"));
    assert.ok(fn.func.includes("/api/ai/outputs/{output_id}"));
    assert.ok(fn.func.includes("daily_overview_strategy"));
    assert.ok(fn.func.includes("strict_daily"));
    assert.ok(fn.func.includes("fallback_hourly"));
    assert.ok(fn.func.includes("Retry-After"));
});

test("openapi helper validates required top-level shape and required paths", () => {
    const missingShape = assertOpenApiShape({});
    assert.ok(missingShape.length > 0);

    const sample = {
        openapi: "3.0.3",
        paths: {
            "/api/v1/health": {},
            "/api/v1/insights/anomaly-report": {},
            "/api/v1/insights/energy-summary": {},
            "/api/v1/insights/city-status": {},
            "/api/v1/insights/latest": {},
            "/api/ai/outputs/{output_id}": {},
        },
        components: { schemas: {} },
    };
    assert.deepEqual(assertOpenApiShape(sample), []);
    assert.deepEqual(assertRequiredPaths(sample), []);
});
