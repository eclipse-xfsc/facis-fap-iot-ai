"use strict";

// NF-6 negative evidence (QA tests 14/15/29): authorization decisions must
// derive from the verified token identity; client-supplied role headers are
// ignored, and a header-injection attempt is rejected.

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePolicyAndRateLimit } = require("./helpers/policy-rate-limit");

const GOVERNANCE_HEADERS = {
    "x-agreement-id": "agreement-1",
    "x-asset-id": "asset-7",
};

const CONSUMER_IDENTITY = {
    sub: "svc-account-facis-orce",
    roles: ["data_analyst"],
};

test("header injection is rejected: forged x-user-roles cannot grant a role", () => {
    const result = evaluatePolicyAndRateLimit({
        headers: {
            ...GOVERNANCE_HEADERS,
            "x-user-roles": "administrator",
        },
        identity: { sub: "attacker", roles: [] },
    });
    assert.equal(result.decision, "forbidden");
    assert.equal(result.statusCode, 403);
    assert.match(result.payload.detail, /none of the required roles/);
});

test("verified identity with the required role passes without any role header", () => {
    const result = evaluatePolicyAndRateLimit({
        headers: GOVERNANCE_HEADERS,
        identity: CONSUMER_IDENTITY,
    });
    assert.equal(result.decision, "ok");
    assert.deepEqual(result.accessContext.roles, ["data_analyst"]);
    assert.equal(result.accessContext.subject, "svc-account-facis-orce");
});

test("authentication failure passes through as 401 (never 403)", () => {
    const result = evaluatePolicyAndRateLimit({
        headers: GOVERNANCE_HEADERS,
        authRejected: true,
    });
    assert.equal(result.decision, "unauthorized");
    assert.equal(result.statusCode, 401);
});

test("missing governance headers still yields 403 for an authenticated caller", () => {
    const result = evaluatePolicyAndRateLimit({
        headers: {},
        identity: CONSUMER_IDENTITY,
    });
    assert.equal(result.decision, "forbidden");
    assert.match(result.payload.detail, /Missing required governance headers/);
});

test("agreement and asset allow-lists are enforced", () => {
    const denied = evaluatePolicyAndRateLimit({
        headers: GOVERNANCE_HEADERS,
        identity: CONSUMER_IDENTITY,
        env: { AI_INSIGHT_POLICY__ALLOWED_AGREEMENT_IDS: '["agreement-9"]' },
    });
    assert.equal(denied.statusCode, 403);
    assert.match(denied.payload.detail, /agreement_id/);

    const deniedAsset = evaluatePolicyAndRateLimit({
        headers: GOVERNANCE_HEADERS,
        identity: CONSUMER_IDENTITY,
        env: { AI_INSIGHT_POLICY__ALLOWED_ASSET_IDS: '["asset-1"]' },
    });
    assert.equal(deniedAsset.statusCode, 403);
    assert.match(deniedAsset.payload.detail, /asset_id/);
});

test("rate limit is keyed by verified subject, not by spoofable headers", () => {
    const buckets = {};
    const env = { AI_INSIGHT_RATE_LIMIT__REQUESTS_PER_MINUTE: "2" };
    const now = 1000000;

    for (let i = 0; i < 2; i += 1) {
        const ok = evaluatePolicyAndRateLimit({
            headers: GOVERNANCE_HEADERS, identity: CONSUMER_IDENTITY, env, buckets, nowMs: now + i,
        });
        assert.equal(ok.decision, "ok");
        assert.equal(ok.limiterKey, "svc-account-facis-orce|agreement-1");
    }

    const limited = evaluatePolicyAndRateLimit({
        headers: GOVERNANCE_HEADERS, identity: CONSUMER_IDENTITY, env, buckets, nowMs: now + 10,
    });
    assert.equal(limited.decision, "rate_limited");
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.retryAfter >= 1);

    // A different verified subject has its own window — one caller cannot
    // exhaust (or pollute) another caller's bucket by reusing the agreement.
    const otherCaller = evaluatePolicyAndRateLimit({
        headers: GOVERNANCE_HEADERS,
        identity: { sub: "another-subject", roles: ["data_analyst"] },
        env, buckets, nowMs: now + 20,
    });
    assert.equal(otherCaller.decision, "ok");
});

test("rate limit window resets after 60s", () => {
    const buckets = {};
    const env = { AI_INSIGHT_RATE_LIMIT__REQUESTS_PER_MINUTE: "1" };
    const now = 5000000;
    assert.equal(evaluatePolicyAndRateLimit({ headers: GOVERNANCE_HEADERS, identity: CONSUMER_IDENTITY, env, buckets, nowMs: now }).decision, "ok");
    assert.equal(evaluatePolicyAndRateLimit({ headers: GOVERNANCE_HEADERS, identity: CONSUMER_IDENTITY, env, buckets, nowMs: now + 1000 }).decision, "rate_limited");
    assert.equal(evaluatePolicyAndRateLimit({ headers: GOVERNANCE_HEADERS, identity: CONSUMER_IDENTITY, env, buckets, nowMs: now + 61000 }).decision, "ok");
});

test("policy disabled still resolves an access context", () => {
    const result = evaluatePolicyAndRateLimit({
        headers: {},
        identity: CONSUMER_IDENTITY,
        env: { AI_INSIGHT_POLICY__ENABLED: "false", AI_INSIGHT_RATE_LIMIT__ENABLED: "false" },
    });
    assert.equal(result.decision, "ok");
    assert.equal(result.accessContext.agreement_id, "unknown-agreement");
});

test("fail closed: authMode=off no longer exists — a forged role header still grants nothing", () => {
    const result = evaluatePolicyAndRateLimit({
        headers: { ...GOVERNANCE_HEADERS, "x-user-roles": "data_analyst" },
        identity: null,
        authMode: "off", // ignored: the header-trust mode was removed from the code
    });
    assert.equal(result.decision, "forbidden");
    assert.equal(result.statusCode, 403);
    assert.match(result.payload.detail, /none of the required roles/);
});

test("required roles: any one of them is enough, others are refused", () => {
    for (const role of ["administrator", "data_scientist", "data_analyst"]) {
        const ok = evaluatePolicyAndRateLimit({ headers: GOVERNANCE_HEADERS, identity: { sub: "s-" + role, roles: [role] } });
        assert.equal(ok.decision, "ok", role);
    }
    const operator = evaluatePolicyAndRateLimit({ headers: GOVERNANCE_HEADERS, identity: { sub: "op", roles: ["operator", "data_engineer"] } });
    assert.equal(operator.decision, "forbidden");
    assert.match(operator.payload.detail, /none of the required roles \(administrator, data_scientist, data_analyst\)/);
});

test("required roles: configured list replaces the default", () => {
    const env = { AI_INSIGHT_POLICY__REQUIRED_ROLES: '["ai_insight_consumer"]' };
    assert.equal(evaluatePolicyAndRateLimit({ headers: GOVERNANCE_HEADERS, identity: { sub: "a", roles: ["ai_insight_consumer"] }, env }).decision, "ok");
    assert.equal(evaluatePolicyAndRateLimit({ headers: GOVERNANCE_HEADERS, identity: { sub: "b", roles: ["data_analyst"] }, env }).decision, "forbidden");
});
