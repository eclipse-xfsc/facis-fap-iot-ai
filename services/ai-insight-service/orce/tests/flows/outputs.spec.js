"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readJsonFromOrce } = require("./helpers/io");
const { buildFallbackOutputText, storeOutputById, lookupOutputById } = require("./helpers/outputs");

test("outputs helper stores and looks up output by id", () => {
    const snapshot = {
        summary: "Summary line",
        key_findings: ["f1"],
        recommendations: ["r1"],
        metadata: {
            output_id: "11111111-1111-4111-8111-111111111111",
            llm_model: "gpt-4o",
            agreement_id: "agreement-1",
            asset_id: "asset-1",
            timestamp: "2026-04-29T12:00:00.000Z",
        },
    };
    const stored = storeOutputById({
        outputsById: {},
        insightType: "anomaly-report",
        snapshot,
        requestPayload: { include_data: false },
        llmRawText: "LLM text",
    });
    const lookup = lookupOutputById(stored, snapshot.metadata.output_id);
    assert.equal(lookup.statusCode, 200);
    assert.equal(lookup.payload.output_text, "LLM text");
    assert.equal(lookup.payload.insight_type, "anomaly-report");
});

test("outputs helper uses deterministic fallback text and 404 on miss", () => {
    const fallback = buildFallbackOutputText({
        summary: "s",
        key_findings: ["a", "b"],
        recommendations: ["c"],
    });
    assert.match(fallback, /^s\n- a\n- b\n- c$/);

    const miss = lookupOutputById({}, "missing-id");
    assert.equal(miss.statusCode, 404);
    assert.equal(miss.payload.detail, "Output not found");
});

test("outputs flow includes expected route and statuses", () => {
    const flow = readJsonFromOrce("flows/ai-insight-outputs.json");
    const route = flow.find((n) => n.type === "http in" && n.url === "/api/ai/outputs/:output_id" && n.method === "get");
    assert.ok(route);
    const responses = flow.filter((n) => n.type === "http response").map((n) => n.name);
    assert.ok(responses.includes("Output 200 JSON"));
    assert.ok(responses.includes("Output 404 JSON"));
    assert.ok(responses.includes("Output 500 JSON"));
});
