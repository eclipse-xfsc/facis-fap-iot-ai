"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePolicyAndRateLimit } = require("./helpers/policy-rate-limit");

test("policy denies missing governance headers", () => {
    const res = evaluatePolicyAndRateLimit({
        headers: {},
        env: {},
        buckets: {},
        nowMs: 1000,
    });
    assert.equal(res.decision, "forbidden");
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.detail, "Missing required governance headers");
});

test("policy denies missing required role and restricted agreement/asset", () => {
    const missingRole = evaluatePolicyAndRateLimit({
        headers: {
            "x-agreement-id": "a1",
            "x-asset-id": "asset-1",
            "x-user-roles": "analyst",
        },
        env: { AI_INSIGHT_POLICY__REQUIRED_ROLES: JSON.stringify(["ai_insight_consumer"]) },
    });
    assert.equal(missingRole.decision, "forbidden");
    assert.match(missingRole.payload.detail, /missing required role/);

    const deniedAgreement = evaluatePolicyAndRateLimit({
        headers: {
            "x-agreement-id": "a1",
            "x-asset-id": "asset-1",
            "x-user-roles": "ai_insight_consumer",
        },
        env: { AI_INSIGHT_POLICY__ALLOWED_AGREEMENT_IDS: JSON.stringify(["a2"]) },
    });
    assert.equal(deniedAgreement.decision, "forbidden");
    assert.equal(deniedAgreement.payload.detail, "Policy denied for agreement_id");

    const deniedAsset = evaluatePolicyAndRateLimit({
        headers: {
            "x-agreement-id": "a1",
            "x-asset-id": "asset-1",
            "x-user-roles": "ai_insight_consumer",
        },
        env: { AI_INSIGHT_POLICY__ALLOWED_ASSET_IDS: JSON.stringify(["asset-2"]) },
    });
    assert.equal(deniedAsset.decision, "forbidden");
    assert.equal(deniedAsset.payload.detail, "Policy denied for asset_id");
});

test("rate limiter emits 429 and Retry-After", () => {
    const headers = {
        "x-agreement-id": "agreement-1",
        "x-asset-id": "asset-1",
        "x-user-roles": "ai_insight_consumer",
    };
    const env = { AI_INSIGHT_RATE_LIMIT__REQUESTS_PER_MINUTE: "1" };
    const first = evaluatePolicyAndRateLimit({ headers, env, buckets: {}, nowMs: 1000 });
    assert.equal(first.decision, "ok");
    const second = evaluatePolicyAndRateLimit({
        headers,
        env,
        buckets: first.buckets,
        nowMs: 2000,
    });
    assert.equal(second.decision, "rate_limited");
    assert.equal(second.statusCode, 429);
    assert.ok(Number(second.headers["Retry-After"]) >= 1);
});

test("policy/rate-limit returns access context on success and supports disabled policy", () => {
    const res = evaluatePolicyAndRateLimit({
        headers: {},
        env: { AI_INSIGHT_POLICY__ENABLED: "false", AI_INSIGHT_RATE_LIMIT__ENABLED: "false" },
        buckets: {},
    });
    assert.equal(res.decision, "ok");
    assert.equal(res.accessContext.agreement_id, "unknown-agreement");
    assert.equal(res.accessContext.asset_id, "unknown-asset");
});
