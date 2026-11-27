/* eslint-disable */
//
// negotiation-permit.spec.js — contract negotiation: a request is stored as
// REQUESTED and finalized only when the policy engine allows
// facis/negotiation/permit for the verified counterparty; deny -> TERMINATED
// with the reason. The policy itself is tested in infrastructure/opa/bundle.
// Runs the committed function nodes through harness/run-node.js.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNode } = require('../harness/run-node.js');

const HOLDER_DID = 'did:web:participant.spec.local';
const ENV = { OCM_POLICY_URL: 'http://policy.spec.local:8080' };

// run a function node; out is the output that fired (or the single result)
async function run(flow, nodeId, msg, env = ENV, globalCtx = new Map()) {
    const r = await runNode(flow, nodeId, { msg, env, globalCtx });
    assert.deepEqual(r.errors, [], nodeId + ' node errors: ' + r.errors.join('; '));
    return { out: r.sent.length ? r.sent[0] : r.result, globalCtx, warnings: r.warnings };
}
function baseMsg(headers = {}, payload = {}) {
    return { req: { headers, params: {} }, res: { set() {} }, payload };
}
const FLOW_NEG = path.join(__dirname, '..', '..', 'flows', 'facis-dsp-negotiations.json');

test('create: missing counterparty/offerId -> 422 on the RESPONSE output, nothing created', async () => {
    const globalCtx = new Map();
    const { out } = await run(FLOW_NEG, 'dsp-neg-create', baseMsg({}, { counterparty: HOLDER_DID }), ENV, globalCtx);
    assert.equal(out[0], null, '422 must not go to prep-permit (output 0)');
    assert.equal(out[1].statusCode, 422);
    assert.equal(out[1].payload.code, 'invalid_request');
    assert.equal(globalCtx.get('negotiations'), undefined);
});

test('create: REQUESTED, never FINALIZED directly', async () => {
    const globalCtx = new Map();
    const { out } = await run(FLOW_NEG, 'dsp-neg-create', baseMsg({}, { counterparty: HOLDER_DID, offerId: 'offer-1' }), ENV, globalCtx);
    assert.ok(out[0]);
    const negs = globalCtx.get('negotiations');
    const neg = negs[out[0]._negId];
    assert.equal(neg.state, 'REQUESTED');
    assert.equal(neg.agreementId, undefined);
});

test('prep-permit: OPA input shape (action negotiation.permit, subject from identity)', async () => {
    const globalCtx = new Map();
    const c = await run(FLOW_NEG, 'dsp-neg-create', baseMsg({}, { counterparty: HOLDER_DID, offerId: 'offer-1', purpose: 'analytics' }), ENV, globalCtx);
    const msg = Object.assign(c.out[0], { identity: { did: HOLDER_DID, roles: ['data_consumer'] } });
    const { out } = await run(FLOW_NEG, 'dsp-neg-prep-permit', msg, ENV, globalCtx);
    assert.match(out[0].url, /\/v1\/data\/facis\/negotiation\/permit$/);
    assert.equal(out[0].payload.input.action, 'negotiation.permit');
    assert.equal(out[0].payload.input.subject.did, HOLDER_DID);
    assert.equal(out[0].payload.input.resource.offerId, 'offer-1');
});

test('check-permit: allow -> FINALIZED+agreement; deny -> TERMINATED with reason; no verdict -> 502 REQUESTED', async () => {
    const mk = async (decision) => {
        const globalCtx = new Map();
        const c = await run(FLOW_NEG, 'dsp-neg-create', baseMsg({}, { counterparty: HOLDER_DID, offerId: 'offer-1' }), ENV, globalCtx);
        const msg = Object.assign(c.out[0], {});
        msg.payload = decision === null ? {} : { result: decision };
        const r = await run(FLOW_NEG, 'dsp-neg-check-permit', msg, ENV, globalCtx);
        return { r, globalCtx, negId: msg._negId };
    };
    const p = await mk({ allow: true, reason: 'ok' });
    assert.ok(p.r.out[0]);
    assert.equal(p.globalCtx.get('negotiations')[p.negId].state, 'FINALIZED');
    assert.ok(p.globalCtx.get('negotiations')[p.negId].agreementId);
    const d = await mk({ allow: false, reason: 'offer not visible in catalogue: offer-1' });
    assert.ok(d.r.out[1]);
    const negD = d.globalCtx.get('negotiations')[d.negId];
    assert.equal(negD.state, 'TERMINATED');
    assert.match(negD.terminationReason, /offer not visible/);
    const u = await mk(null);
    assert.equal(u.r.out[2].statusCode, 502);
    assert.equal(u.globalCtx.get('negotiations')[u.negId].state, 'REQUESTED');
});

test('get/terminate unchanged: read by id (200/404), terminate -> TERMINATED', async () => {
    const globalCtx = new Map();
    const c = await run(FLOW_NEG, 'dsp-neg-create', baseMsg({}, { counterparty: HOLDER_DID, offerId: 'offer-1' }), ENV, globalCtx);
    const negId = c.out[0]._negId;
    const g = await run(FLOW_NEG, 'dsp-neg-get', { req: { params: { id: negId } } }, ENV, globalCtx);
    assert.equal(g.out.statusCode, 200);
    assert.equal(g.out.payload.id, negId);
    const g404 = await run(FLOW_NEG, 'dsp-neg-get', { req: { params: { id: 'neg-nope' } } }, ENV, globalCtx);
    assert.equal(g404.out.statusCode, 404);
    const t = await run(FLOW_NEG, 'dsp-neg-terminate', { req: { params: { id: negId } } }, ENV, globalCtx);
    assert.equal(t.out[0].statusCode, 200);
    assert.equal(t.out[0].payload.state, 'TERMINATED');
    assert.ok(t.out[1], 'terminate must feed the persist output');
    assert.equal(globalCtx.get('negotiations')[negId].state, 'TERMINATED');
});
