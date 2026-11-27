"use strict";

// Runs the real function-node bodies of the flow JSON (not the mirrors in
// helpers/) for the token verifier and the five role gates, with the DSP
// connector's run-node.js harness: the roles claim, the default required
// roles (any one of the schema roles) and the configured override.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jose = require("jose");
const { runNode } = require("../../../../dsp-connector/orce/tests/harness/run-node.js");

const FLOWS = path.join(__dirname, "../../flows");
const ISSUER = "https://issuer.example.org";
const KID = "k1";
let privateKey;
let jwks;

test.before(async () => {
    const pair = await jose.generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const jwk = await jose.exportJWK(pair.publicKey);
    jwk.kid = KID;
    jwk.alg = "RS256";
    jwks = { keys: [jwk] };
});

async function token(claims) {
    return new jose.SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: KID })
        .setIssuer(ISSUER)
        .setSubject("subject-1")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
}

async function verify(claims, env) {
    const r = await runNode(path.join(FLOWS, "ai-insight-auth.json"), "fn_auth_verify", {
        env: env || {},
        libs: { jose },
        msg: { _authToken: await token(claims), _authKid: KID, _authIssuer: ISSUER, _authJwks: jwks, _authOrigPayload: {} },
    });
    assert.equal(r.sent.length, 1);
    return r.sent[0];
}

test("verifier node: default roles claim is the top-level roles (guard tokens), strings only", async () => {
    const m = await verify({ realm_access: { roles: ["data_analyst"] }, roles: ["data_scientist", 7] });
    assert.equal(m.authRejected, false);
    assert.deepEqual([...m.identity.roles], ["data_scientist"]);
});

test("verifier node: AI_INSIGHT_AUTH__ROLES_CLAIM=realm_access.roles reads Keycloak realm roles", async () => {
    const m = await verify({ realm_access: { roles: ["data_analyst"] }, roles: ["administrator"] }, { AI_INSIGHT_AUTH__ROLES_CLAIM: "realm_access.roles" });
    assert.deepEqual([...m.identity.roles], ["data_analyst"]);
});

test("verifier node: a roles claim that is missing or not a list gives no roles", async () => {
    let m = await verify({ roles: "administrator" });
    assert.deepEqual([...m.identity.roles], []);
    m = await verify({}, { AI_INSIGHT_AUTH__ROLES_CLAIM: "a.b.c" });
    assert.equal(m.authRejected, false);
    assert.deepEqual([...m.identity.roles], []);
});

async function prep(env, claims) {
    const r = await runNode(path.join(FLOWS, "ai-insight-auth.json"), "fn_auth_prep", {
        env: env, globalCtx: new Map(),
        msg: { req: { headers: { authorization: "Bearer " + await token(claims || {}) } }, payload: {} },
    });
    return r.result;
}

test("token prep node: without AI_INSIGHT_AUTH__ISSUER or __JWKS_URL every call fails closed (503)", async () => {
    for (const env of [{}, { AI_INSIGHT_AUTH__ISSUER: ISSUER }, { AI_INSIGHT_AUTH__JWKS_URL: "https://issuer.example.org/.well-known/jwks.json" }]) {
        const out = await prep(env);
        const m = out.find((x) => x);
        assert.equal(m.statusCode, 503, JSON.stringify(env));
        assert.match(m.payload.detail, /AI_INSIGHT_AUTH__ISSUER and AI_INSIGHT_AUTH__JWKS_URL/);
        assert.equal(m.authRejected, true);
    }
});

test("token prep node: with both set, the JWKS is fetched from the configured URL only", async () => {
    const out = await prep({ AI_INSIGHT_AUTH__ISSUER: ISSUER, AI_INSIGHT_AUTH__JWKS_URL: "https://issuer.example.org/.well-known/jwks.json" });
    assert.equal(out[1].url, "https://issuer.example.org/.well-known/jwks.json");
});

const GATES = [
    ["ai-insight-anomaly.json", "fn_policy_rate_limit"],
    ["ai-insight-city-status.json", "fn_policy_rate_limit_city"],
    ["ai-insight-energy-summary.json", "fn_policy_rate_limit_energy"],
    ["ai-insight-latest.json", "fn_auth_gate_latest"],
    ["ai-insight-outputs.json", "fn_auth_gate_outputs"],
];
const SCOPE = { "x-agreement-id": "agreement-1", "x-asset-id": "asset-7" };

async function gate(file, id, roles, env) {
    const r = await runNode(path.join(FLOWS, file), id, {
        env: Object.assign({ AI_INSIGHT_RATE_LIMIT__ENABLED: "false" }, env || {}),
        globalCtx: new Map(),
        msg: { req: { headers: { ...SCOPE }, query: {}, params: {} }, headers: { ...SCOPE }, payload: {},
            identity: { sub: "subject-" + roles.join("-"), roles }, authRejected: false },
    });
    const outs = Array.isArray(r.result) ? r.result : [r.result];
    const denied = outs.find((m) => m && m.statusCode === 403);
    return denied ? { decision: "forbidden", detail: denied.payload && denied.payload.detail } : { decision: "ok" };
}

for (const [file, id] of GATES) {
    test(`role gate ${id}: any one schema role passes, others are refused`, async () => {
        for (const role of ["administrator", "data_scientist", "data_analyst"]) {
            assert.equal((await gate(file, id, [role])).decision, "ok", role);
        }
        const refused = await gate(file, id, ["operator", "data_engineer", "ai_insight_consumer"]);
        assert.equal(refused.decision, "forbidden");
        assert.match(refused.detail, /none of the required roles \(administrator, data_scientist, data_analyst\)/);
    });

    test(`role gate ${id}: a configured list replaces the default`, async () => {
        const env = { AI_INSIGHT_POLICY__REQUIRED_ROLES: '["ai_insight_consumer"]' };
        assert.equal((await gate(file, id, ["ai_insight_consumer"], env)).decision, "ok");
        assert.equal((await gate(file, id, ["data_analyst"], env)).decision, "forbidden");
    });
}
