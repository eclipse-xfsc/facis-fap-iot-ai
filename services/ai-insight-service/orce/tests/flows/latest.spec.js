"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonFromOrce } = require("./helpers/io");
const { INSIGHT_TYPES, buildLatestInsightsResponse } = require("./helpers/latest");

test("latest helper returns null entries when cache is empty", () => {
    const response = buildLatestInsightsResponse({}, "2026-04-29T00:00:00.000Z");
    for (const key of INSIGHT_TYPES) {
        assert.equal(response.latest[key], null);
    }
});

test("latest helper normalizes metadata and llm_used", () => {
    const response = buildLatestInsightsResponse({
        "energy-summary": {
            cached_at: "2026-04-29T01:00:00.000Z",
            output: {
                summary: "ok",
                metadata: { output_id: "o1", llm_model: "gpt-4o", agreement_id: "a1", asset_id: "as1" },
            },
        },
        "anomaly-report": {
            output: {
                summary: "fallback",
                metadata: { llm_model: "rule-based-fallback" },
            },
        },
    });
    assert.equal(response.latest["energy-summary"].output.metadata.llm_used, true);
    assert.equal(response.latest["anomaly-report"].output.metadata.llm_used, false);
    assert.equal(response.latest["city-status"], null);
});

test("latest flow includes expected GET route and statuses", () => {
    const flow = readJsonFromOrce("flows/ai-insight-latest.json");
    const route = flow.find((n) => n.type === "http in" && n.url === "/api/v1/insights/latest" && n.method === "get");
    assert.ok(route);
    const responses = flow.filter((n) => n.type === "http response").map((n) => n.name);
    assert.ok(responses.includes("Latest 200 JSON"));
    assert.ok(responses.includes("Latest 500 JSON"));
});
