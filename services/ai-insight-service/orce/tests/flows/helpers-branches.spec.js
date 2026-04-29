"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { validateAnomalyRequest, validateEnergyRequest, validateCityRequest } = require("./helpers/validation");
const { buildLatestInsightsResponse } = require("./helpers/latest");
const { buildFallbackOutputText, storeOutputById, lookupOutputById } = require("./helpers/outputs");
const { assertOpenApiShape, assertRequiredPaths } = require("./helpers/openapi");

test("validation helper covers object check and invalid JSON branches", () => {
    assert.equal(validateAnomalyRequest(null).ok, false);
    assert.equal(validateAnomalyRequest("{bad-json").detail, "Request body must be valid JSON");
    assert.equal(validateEnergyRequest([]).detail, "Request body must be a JSON object");
    assert.equal(validateCityRequest({ start_ts: "bad", end_ts: "bad" }).ok, false);
});

test("validation helper covers explicit timezone/include_data and JSON string parsing", () => {
    const anomaly = validateAnomalyRequest(
        JSON.stringify({
            start_ts: "2026-03-01T00:00:00Z",
            end_ts: "2026-03-01T01:00:00Z",
            timezone: "Europe/Lisbon",
            include_data: true,
        }),
    );
    assert.equal(anomaly.ok, true);
    assert.equal(anomaly.value.timezone, "Europe/Lisbon");
    assert.equal(anomaly.value.include_data, true);

    const energy = validateEnergyRequest({
        start_ts: "2026-03-01T00:00:00Z",
        end_ts: "2026-03-01T01:00:00Z",
        timezone: "Europe/Lisbon",
        include_data: true,
    });
    assert.equal(energy.ok, true);
    assert.equal(energy.value.timezone, "Europe/Lisbon");
    assert.equal(energy.value.include_data, true);

    const city = validateCityRequest({
        start_ts: "2026-03-01T00:00:00Z",
        end_ts: "2026-03-01T01:00:00Z",
        timezone: "Europe/Lisbon",
        include_data: true,
    });
    assert.equal(city.ok, true);
    assert.equal(city.value.timezone, "Europe/Lisbon");
    assert.equal(city.value.include_data, true);
});

test("latest helper covers populated arrays and default metadata branches", () => {
    const response = buildLatestInsightsResponse({
        "city-status": {
            output: {
                summary: "City summary",
                key_findings: ["f1", 2],
                recommendations: ["r1", 3],
                data: { points: 2 },
                metadata: {
                    output_id: "o-city",
                    timestamp: "2026-01-01T00:00:00.000Z",
                    agreement_id: "a-city",
                    asset_id: "asset-city",
                },
            },
        },
    });
    assert.equal(response.latest["city-status"].output.metadata.llm_model, "rule-based-fallback");
    assert.equal(response.latest["city-status"].output.metadata.llm_used, false);
    assert.deepEqual(response.latest["city-status"].output.key_findings, ["f1", "2"]);
    assert.deepEqual(response.latest["city-status"].output.recommendations, ["r1", "3"]);
    assert.deepEqual(response.latest["city-status"].output.data, { points: 2 });
});

test("latest helper covers non-object output and metadata fallback branches", () => {
    const response = buildLatestInsightsResponse({
        "energy-summary": {
            output: "invalid-output",
        },
        "anomaly-report": {
            output: {
                metadata: "invalid-metadata",
            },
        },
    });
    assert.equal(response.latest["energy-summary"].output.summary, "");
    assert.equal(response.latest["energy-summary"].output.metadata.output_id, "latest-energy-summary");
    assert.equal(response.latest["anomaly-report"].output.metadata.agreement_id, "unknown-agreement");
});

test("outputs helper covers fallback text, missing output_id and empty lookup id", () => {
    assert.equal(buildFallbackOutputText({}), "");

    const unchanged = storeOutputById({
        outputsById: { keep: { id: "keep" } },
        insightType: "energy-summary",
        snapshot: { metadata: {} },
        requestPayload: null,
        llmRawText: "",
    });
    assert.deepEqual(unchanged, { keep: { id: "keep" } });

    const stored = storeOutputById({
        outputsById: {},
        insightType: "energy-summary",
        snapshot: {
            summary: "s",
            key_findings: ["a"],
            recommendations: ["b"],
            metadata: { output_id: "o1" },
        },
        llmRawText: "   ",
    });
    assert.match(stored.o1.output_text, /- a/);

    assert.equal(lookupOutputById(stored, "").statusCode, 404);
});

test("outputs helper covers metadata and structured_output fallback branches", () => {
    const stored = storeOutputById({
        outputsById: {},
        insightType: "city-status",
        snapshot: {
            summary: "city",
            key_findings: "not-array",
            recommendations: "not-array",
            metadata: { output_id: "out-2", agreement_id: "a2", asset_id: "asset-2", llm_model: "gpt-4o" },
        },
        requestPayload: { include_data: false },
        llmRawText: "raw",
        now: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(stored["out-2"].agreement_id, "a2");
    assert.equal(stored["out-2"].asset_id, "asset-2");
    assert.equal(stored["out-2"].llm_model, "gpt-4o");
    assert.deepEqual(stored["out-2"].structured_output.key_findings, []);
    assert.deepEqual(stored["out-2"].structured_output.recommendations, []);
});

test("openapi helper covers missing required paths branch", () => {
    assert.ok(assertOpenApiShape(null).includes("spec_object"));
    const missing = assertRequiredPaths({
        paths: {
            "/api/v1/health": {},
            "/api/v1/insights/anomaly-report": {},
        },
    });
    assert.ok(missing.includes("/api/v1/insights/energy-summary"));
});
