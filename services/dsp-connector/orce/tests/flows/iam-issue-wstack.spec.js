/* eslint-disable */
//
// iam-issue-wstack.spec.js — outbound presentations (iam.issue): the
// connector's participant credential (an SD-JWT VC) comes from its W-Stack
// tenant's storage (DCQL query), and the tenant's crypto provider adds the key
// binding for the counterparty with the tenant's key; no private key in the
// connector. Runs the committed function nodes through harness/run-node.js;
// the HTTP answers are fed in as the http request nodes would.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNode } = require('../harness/run-node.js');
const F = require('../harness/sdjwt-fixtures.js');

const FLOW = path.join(__dirname, '..', '..', 'flows', 'facis-dsp-iam-issue.json');
const VERIFY_FLOW = path.join(__dirname, '..', '..', 'flows', 'facis-dsp-iam-verify.json');
const ENV = {
    DSP_PARTICIPANT_VCT: F.VCT,
    OCM_STORAGE_URL: 'http://storage.spec.local:8080',
    OCM_TENANT: 'participant',
    OCM_REGION: 'EU',
    OCM_COUNTRY: 'DE',
    OCM_ACCOUNT: 'default',
    OCM_CRYPTO_URL: 'http://crypto.spec.local:8080',
    OCM_KEY_NAMESPACE: 'ocm-wstack',
    OCM_KEY_GROUP: 'default',
    OCM_KEY: 'eckey'
};

async function step(nodeId, msg, env = ENV, flow = FLOW) {
    const r = await runNode(flow, nodeId, { msg, env });
    assert.deepEqual(r.errors, [], nodeId + ' node errors: ' + r.errors.join('; '));
    const outs = Array.isArray(r.result) ? r.result : [r.result];
    const port = outs.findIndex((m) => m);
    return { port, msg: outs[port] };
}
const code = (m) => m.payload && m.payload['dspace:code'];
const plain = (v) => JSON.parse(JSON.stringify(v));
const stored = (sdjwt) => ({ groups: [{ description: { id: 'participant', format: 'dc+sd-jwt' }, credentials: { c1: { type: 'dc+sd-jwt', data: sdjwt } } }] });
const issued = (c) => c.ijwt + '~' + c.discs.map((d) => d + '~').join('');

async function toStorage(counterparty = F.CONNECTOR_AUD) {
    const prep = await step('dsp-iam-issue-prep', { payload: { counterparty }, req: { headers: {} } });
    assert.equal(prep.port, 0);
    return step('dsp-iam-issue-prep-storage', prep.msg);
}

test('prep: no counterparty and no DSP_PEER_ENDPOINT -> 500 config_missing; a fresh random nonce otherwise', async () => {
    const none = await step('dsp-iam-issue-prep', { payload: {}, req: { headers: {} } });
    assert.equal(code(none.msg), 'config_missing');
    const a = await step('dsp-iam-issue-prep', { payload: { counterparty: F.CONNECTOR_AUD }, req: { headers: {} } });
    const b = await step('dsp-iam-issue-prep', { payload: { counterparty: F.CONNECTOR_AUD }, req: { headers: {} } });
    assert.equal(a.msg._iamIssue.audience, F.CONNECTOR_AUD);
    const consumer = await step('dsp-iam-issue-prep', { payload: { providerBaseUrl: F.CONNECTOR_AUD + '/', assetId: 'a', agreementId: 'g' }, req: { headers: {} } });
    assert.equal(consumer.msg._iamIssue.audience, F.CONNECTOR_AUD, 'the consumer flow passes the provider base URL');
    assert.ok(a.msg._iamIssue.nonce.length >= 16 && a.msg._iamIssue.nonce !== b.msg._iamIssue.nonce);
});

test('storage query: tenant, region, country and account in the path; DCQL for the participant SD-JWT VC', async () => {
    const r = await toStorage();
    assert.equal(r.msg.url, 'http://storage.spec.local:8080/v1/tenants/participant/storage/EU/DE/default/credentials');
    assert.equal(r.msg.method, 'POST');
    assert.deepEqual(plain(r.msg.payload), { credentials: [{ id: 'participant', format: 'dc+sd-jwt', meta: { vct_values: [F.VCT] } }] });
    for (const k of ['OCM_STORAGE_URL', 'OCM_TENANT', 'OCM_REGION', 'OCM_COUNTRY', 'OCM_ACCOUNT', 'DSP_PARTICIPANT_VCT']) {
        const prep = await step('dsp-iam-issue-prep', { payload: { counterparty: F.CONNECTOR_AUD }, req: { headers: {} } });
        const env = Object.assign({}, ENV, { [k]: '' });
        assert.equal(code((await step('dsp-iam-issue-prep-storage', prep.msg, env)).msg), 'config_missing', k);
    }
});

test('storage answer: nothing stored -> 500 no_credential; an error -> 502; expired credentials are skipped, the latest valid one is taken', async () => {
    const q = await toStorage();
    assert.equal(code((await step('dsp-iam-issue-check-storage', Object.assign(plain(q.msg), { statusCode: 200, payload: {} }))).msg), 'no_credential');
    assert.equal(code((await step('dsp-iam-issue-check-storage', Object.assign(plain(q.msg), { statusCode: 400, payload: { message: 'x' } }))).msg), 'storage_unavailable');
    const now = Math.floor(Date.now() / 1000);
    const expired = issued(F.credential({ claims: { exp: now - 10 } }));
    assert.equal(code((await step('dsp-iam-issue-check-storage', Object.assign(plain(q.msg), { statusCode: 200, payload: stored(expired) }))).msg), 'no_credential');
    const soon = issued(F.credential({ claims: { exp: now + 60 } }));
    const later = issued(F.credential({ claims: { exp: now + 7200 } }));
    const both = { groups: [{ credentials: { a: { data: soon }, b: { data: later }, c: { data: expired } } }] };
    const r = await step('dsp-iam-issue-check-storage', Object.assign(plain(q.msg), { statusCode: 200, payload: both }));
    assert.equal(r.port, 0);
    assert.equal(r.msg._iamIssue.vcToken, later);
    assert.deepEqual(plain(r.msg.payload), { counterparty: F.CONNECTOR_AUD }, 'the caller payload is restored');
});

test('proof request: the tenant key, dc+sd-jwt, the counterparty audience, the nonce and the disclosures the credential holds', async () => {
    const q = await toStorage();
    const c = issued(F.credential());
    const s = await step('dsp-iam-issue-check-storage', Object.assign(q.msg, { statusCode: 200, payload: stored(c) }));
    const r = await step('dsp-iam-issue-prep-proof', s.msg);
    assert.equal(r.msg.url, 'http://crypto.spec.local:8080/v1/presentation/proof');
    assert.deepEqual(plain(r.msg.payload), {
        namespace: 'ocm-wstack', group: 'default', key: 'eckey', format: 'dc+sd-jwt', presentation: c,
        aud: F.CONNECTOR_AUD, nonce: s.msg._iamIssue.nonce, disclosureFrame: ['legalName', 'participantRoles']
    });
    // a credential whose claims are not selectively disclosable: nothing to list
    const flat = F.credential();
    const plainCred = F.signJwt({ alg: 'ES256', typ: 'dc+sd-jwt' }, Object.assign({}, flat.payload, { _sd: undefined, legalName: 'X' }), F.keys.issuer) + '~';
    const s2 = await step('dsp-iam-issue-check-storage', Object.assign(plain(q.msg), { statusCode: 200, payload: stored(plainCred) }));
    assert.deepEqual(plain((await step('dsp-iam-issue-prep-proof', s2.msg)).msg.payload.disclosureFrame), []);
    const noKey = Object.assign({}, ENV, { OCM_KEY: '' });
    assert.equal(code((await step('dsp-iam-issue-prep-proof', plain(s.msg), noKey)).msg), 'config_missing');
});

test('proof answer: an error, no key binding or another credential -> 502 proof_failed; otherwise msg.vpToken only', async () => {
    const q = await toStorage();
    const cred = F.credential();
    const s = await step('dsp-iam-issue-check-storage', Object.assign(q.msg, { statusCode: 200, payload: stored(issued(cred)) }));
    const p = await step('dsp-iam-issue-prep-proof', s.msg);
    const answer = (statusCode, payload) => step('dsp-iam-issue-check-proof', Object.assign(plain(p.msg), { statusCode, payload }));
    assert.equal(code((await answer(400, { message: 'bad' })).msg), 'proof_failed');
    assert.equal(code((await answer(200, issued(cred))).msg), 'proof_failed', 'no key binding');
    assert.equal(code((await answer(200, F.presentation())).msg), 'proof_failed', 'another credential');
    const token = F.presentation({ credential: cred, nonce: s.msg._iamIssue.nonce });
    const ok = await answer(200, token);
    assert.equal(ok.port, 0);
    assert.equal(ok.msg.vpToken, token);
    assert.deepEqual(plain(ok.msg.payload), { counterparty: F.CONNECTOR_AUD }, 'the presentation never lands in the payload');
});

test('round trip: what iam.issue presents for a counterparty passes that counterparty\'s iam.verify checks', async () => {
    const q = await toStorage(F.CONNECTOR_AUD);
    const cred = F.credential();
    const s = await step('dsp-iam-issue-check-storage', Object.assign(q.msg, { statusCode: 200, payload: stored(issued(cred)) }));
    const p = await step('dsp-iam-issue-prep-proof', s.msg);
    // the crypto provider signs the key binding with the tenant key = the participant key here
    const token = F.presentation({ credential: cred, nonce: p.msg.payload.nonce, kb: { aud: p.msg.payload.aud } });
    const out = await step('dsp-iam-issue-check-proof', Object.assign(p.msg, { statusCode: 200, payload: token }));
    const verified = await step('dsp-iam-prep', F.bearer(out.msg.vpToken), F.ENV, VERIFY_FLOW);
    assert.equal(verified.port, 0, 'accepted by the verifier: ' + JSON.stringify(verified.msg.payload));
    assert.equal(verified.msg._iamVp.holderDid, F.PARTICIPANT_DID);
});
