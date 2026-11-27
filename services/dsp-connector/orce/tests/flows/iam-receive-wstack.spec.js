/* eslint-disable */
//
// iam-receive-wstack.spec.js — POST /iam/credentials/offers: the connector
// accepts its participant credential, offered by the federation issuer, into
// its own W-Stack tenant. Admin only; the tenant's retrieval service resolves
// the offer, the connector checks the issuer and the credential type, then
// accepts with the tenant's key or refuses (the offer is deleted). Runs the
// committed function nodes through harness/run-node.js; the retrieval
// service's answers are fed in as the http request nodes would.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNode } = require('../harness/run-node.js');

const FLOW = path.join(__dirname, '..', '..', 'flows', 'facis-dsp-iam-receive.json');
const ISSUER_URL = 'https://issuer.spec.local';
const VCT = 'https://issuer.spec.local/vct/FacisParticipantCredential';
const REQ = '0b8f3c7e-2d4a-4e1b-9c5f-6a7d8e9f0a1b';
const ENV = {
    DSP_ADMIN_TOKEN: 'admin-token-for-the-spec',
    DSP_TRUSTED_ISSUERS: 'did:web:issuer.spec.local',
    DSP_PARTICIPANT_VCT: VCT,
    OCM_RETRIEVAL_URL: 'http://retrieval.spec.local:8080',
    OCM_TENANT: 'participant',
    OCM_ACCOUNT: 'default',
    OCM_KEY_NAMESPACE: 'ocm-wstack',
    OCM_KEY_GROUP: 'default',
    OCM_KEY: 'eckey'
};

async function step(nodeId, msg, env = ENV) {
    const r = await runNode(FLOW, nodeId, { msg, env });
    assert.deepEqual(r.errors, [], nodeId + ' node errors: ' + r.errors.join('; '));
    const outs = Array.isArray(r.result) ? r.result : [r.result];
    const port = outs.findIndex((m) => m);
    return { port, msg: outs[port] };
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const post = (body, token = ENV.DSP_ADMIN_TOKEN) => ({ req: { headers: token ? { authorization: 'Bearer ' + token } : {} }, payload: body });
const row = (over = {}) => Object.assign({
    groupId: 'default', requestId: REQ, status: 'received',
    offering: { credential_issuer: ISSUER_URL, credential_configuration_ids: ['participant_sd_jwt'] },
    metadata: { credential_issuer: ISSUER_URL, credential_configurations_supported: { participant_sd_jwt: { format: 'dc+sd-jwt', vct: VCT } } }
}, over);

// the chain up to the clear request, with the given resolved offer
async function upToClear(rows, env = ENV) {
    const s = await step('dsp-iam-recv-start', post({ credential_offer_uri: 'https://issuer.spec.local/offer/1' }), env);
    const r = await step('dsp-iam-recv-resolved', Object.assign(s.msg, { statusCode: 200, payload: REQ }), env);
    return step('dsp-iam-recv-check', Object.assign(r.msg, { statusCode: 200, payload: rows }), env);
}

test('admin only: no token, a wrong token, or no DSP_ADMIN_TOKEN configured -> 401', async () => {
    for (const [m, env] of [[post({ credential_offer_uri: 'x' }, ''), ENV], [post({ credential_offer_uri: 'x' }, 'wrong'), ENV],
        [post({ credential_offer_uri: 'x' }, 'anything'), Object.assign({}, ENV, { DSP_ADMIN_TOKEN: '' })]]) {
        const r = await step('dsp-iam-recv-start', m, env);
        assert.equal(r.port, 1);
        assert.equal(r.msg.statusCode, 401);
    }
});

test('the offer is handed to the tenant retrieval service as an offer link, from a link, a URI or the offer JSON', async () => {
    const offerJson = JSON.stringify({ credential_issuer: ISSUER_URL, credential_configuration_ids: ['participant_sd_jwt'] });
    const byValue = 'openid-credential-offer://?credential_offer=' + encodeURIComponent(offerJson);
    const byRef = 'openid-credential-offer://?credential_offer_uri=' + encodeURIComponent('https://issuer.spec.local/offer/1');
    const cases = [
        [{ offer: byValue }, { credential_offer: byValue }],
        [{ offer: byRef }, { credential_offer_uri: byRef }],
        [{ credential_offer_uri: 'https://issuer.spec.local/offer/1' }, { credential_offer_uri: byRef }],
        [{ credential_offer: offerJson }, { credential_offer: byValue }],
        [{ credential_offer: JSON.parse(offerJson) }, { credential_offer: byValue }],
    ];
    for (const [body, sent] of cases) {
        const r = await step('dsp-iam-recv-start', post(body));
        assert.equal(r.port, 0);
        assert.equal(r.msg.method, 'PUT');
        assert.equal(r.msg.url, 'http://retrieval.spec.local:8080/v1/tenants/participant/offering/retrieve/default');
        assert.deepEqual(plain(r.msg.payload), sent);
    }
    const none = await step('dsp-iam-recv-start', post({}));
    assert.equal(none.msg.statusCode, 400);
    const noConf = await step('dsp-iam-recv-start', post({ credential_offer_uri: 'x' }), Object.assign({}, ENV, { OCM_RETRIEVAL_URL: '' }));
    assert.equal(noConf.msg.statusCode, 500);
});

test('an offer the retrieval service cannot resolve -> 502, nothing else is called', async () => {
    const s = await step('dsp-iam-recv-start', post({ credential_offer_uri: 'https://issuer.spec.local/offer/1' }));
    const r = await step('dsp-iam-recv-resolved', Object.assign(s.msg, { statusCode: 400, payload: '' }));
    assert.equal(r.port, 1);
    assert.equal(r.msg.statusCode, 502);
});

test('a trusted issuer offering the participant SD-JWT VC is accepted with the tenant key', async () => {
    const c = await upToClear([row({ requestId: 'another' }), row()]);
    assert.equal(c.port, 0);
    assert.equal(c.msg.method, 'DELETE');
    assert.equal(c.msg.url, 'http://retrieval.spec.local:8080/v1/tenants/participant/offering/clear/default/' + REQ);
    assert.deepEqual(plain(c.msg.payload), { accept: true, holderKey: 'eckey', holderNamespace: 'ocm-wstack', holderGroup: 'default' });
    const done = await step('dsp-iam-recv-done', Object.assign(c.msg, { statusCode: 200, payload: { credentials: [{ credential: 'eyJ...~' }] } }));
    assert.equal(done.msg.statusCode, 201);
    assert.deepEqual(plain(done.msg.payload), { status: 'stored', requestId: REQ, issuer: 'did:web:issuer.spec.local', configurations: ['participant_sd_jwt'] });
    assert.ok(!JSON.stringify(done.msg.payload).includes('eyJ'), 'the credential is never returned');
});

test('an untrusted issuer, another credential type or format is refused: the offer is deleted, nothing is issued', async () => {
    const untrusted = row({ offering: { credential_issuer: 'https://rogue.spec.local', credential_configuration_ids: ['participant_sd_jwt'] } });
    const otherVct = row({ metadata: { credential_configurations_supported: { participant_sd_jwt: { format: 'dc+sd-jwt', vct: 'https://issuer.spec.local/vct/Other' } } } });
    const otherFormat = row({ metadata: { credential_configurations_supported: { participant_sd_jwt: { format: 'jwt_vc_json' } } } });
    const unknownConf = row({ offering: { credential_issuer: ISSUER_URL, credential_configuration_ids: ['nope'] } });
    for (const rw of [untrusted, otherVct, otherFormat, unknownConf]) {
        const c = await upToClear([rw]);
        assert.equal(c.port, 0);
        assert.deepEqual(plain(c.msg.payload), { accept: false });
        const done = await step('dsp-iam-recv-done', Object.assign(c.msg, { statusCode: 200, payload: null }));
        assert.equal(done.msg.statusCode, 403);
        assert.equal(done.msg.payload.error, 'offer_refused');
        assert.equal(done.msg.payload.deleted, true);
    }
});

test('the resolved offer missing from the list -> 502; a failed issuance after acceptance -> 502', async () => {
    const missing = await upToClear([row({ requestId: 'another' })]);
    assert.equal(missing.port, 1);
    assert.equal(missing.msg.statusCode, 502);
    const c = await upToClear([row()]);
    const done = await step('dsp-iam-recv-done', Object.assign(c.msg, { statusCode: 400, payload: { error: 'error during token get' } }));
    assert.equal(done.msg.statusCode, 502);
    assert.equal(done.msg.payload.error, 'issuance_failed');
});

test('the event logs the outcome without the offer or the credential', async () => {
    const c = await upToClear([row()]);
    const done = await step('dsp-iam-recv-done', Object.assign(c.msg, { statusCode: 200, payload: { credentials: [] } }));
    const r = await runNode(FLOW, 'dsp-iam-recv-event', { msg: done.msg, env: ENV });
    const ev = JSON.parse(r.warnings[0]);
    assert.equal(ev.event, 'iam.receive');
    assert.equal(ev.result, 'stored');
    assert.equal(ev.issuer, 'did:web:issuer.spec.local');
    assert.equal(r.result._recv, undefined);
});
