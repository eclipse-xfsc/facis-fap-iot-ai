/* eslint-disable */
//
// iam-verify-wstack.spec.js — inbound presentations (iam.verify). The
// counterparty's Bearer token is an SD-JWT VC presentation with key binding:
//   - dsp-iam-prep checks the key binding (signature by cnf.jwk, sd_hash),
//     the disclosures, audience, freshness, nonce replay and the credential;
//   - the W-Stack crypto provider checks the issuer's signature;
//   - the status list token and the participant's DID document are checked
//     last: revocation, and the holder key belongs to the participant's DID.
// Every failure is fail closed (401). Runs the committed function nodes
// through harness/run-node.js; the HTTP answers are fed in as the http
// request nodes would.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runNode } = require('../harness/run-node.js');
const F = require('../harness/sdjwt-fixtures.js');

const FLOW = path.join(__dirname, '..', '..', 'flows', 'facis-dsp-iam-verify.json');

// run one node; returns { port, msg } for the output that fired
async function step(nodeId, msg, env = F.ENV, globalCtx = new Map()) {
    const r = await runNode(FLOW, nodeId, { msg, env, globalCtx });
    assert.deepEqual(r.errors, [], nodeId + ' node errors: ' + r.errors.join('; '));
    const outs = Array.isArray(r.result) ? r.result : [r.result];
    const port = outs.findIndex((m) => m);
    return { port, msg: outs[port], globalCtx };
}
const code = (m) => m.payload && m.payload['dspace:code'];

// the whole chain with the HTTP answers a healthy W-Stack and did:web give
async function chain(token, opts = {}) {
    const g = opts.globalCtx || new Map();
    let r = await step('dsp-iam-prep', F.bearer(token), F.ENV, g);
    if (r.port !== 0) return r;
    r = await step('dsp-iam-trusted-issuer', r.msg, F.ENV, g);
    if (r.port !== 0) return r;
    r = await step('dsp-iam-prep-vp-ocm', r.msg, F.ENV, g);
    if (r.port !== 0) return r;
    const vp = r.msg._iamVp;
    r.msg.statusCode = opts.cpStatus || 200;
    r.msg.payload = opts.cpAnswer || { valid: true, disclosedCredential: { iss: vp.issuer, sub: vp.holderDid } };
    r = await step('dsp-iam-check-vp-ocm', r.msg, F.ENV, g);
    if (r.port !== 0) return r;
    r.msg.statusCode = 200;
    r.msg.payload = 'statusToken' in opts ? opts.statusToken : F.statusListToken();
    r = await step('dsp-iam-resolve-dids', r.msg, F.ENV, g);
    const docs = { [F.ISSUER_DID]: F.issuerDoc(), [F.PARTICIPANT_DID]: opts.participantDoc || F.participantDoc() };
    while (r.port === 0) {
        r.msg.statusCode = 200;
        r.msg.payload = docs[r.msg._iamDidPending];
        r = await step('dsp-iam-resolve-dids', r.msg, F.ENV, g);
    }
    if (r.port !== 1) return r;
    return step('dsp-iam-check-status-list', r.msg, F.ENV, g);
}

test('a valid presentation passes the whole chain: identity is the participant DID with its roles, the nonce is spent', async () => {
    const g = new Map();
    const token = F.presentation({ nonce: 'nonce-valid-0000000001' });
    const r = await chain(token, { globalCtx: g });
    assert.equal(r.port, 0);
    assert.equal(r.msg.iamRejected, false);
    assert.deepEqual(JSON.parse(JSON.stringify(r.msg.identity)), { did: F.PARTICIPANT_DID, roles: ['data_consumer'], issuer: F.ISSUER_DID, legalName: 'Example Participant' });
    assert.ok(g.get('iamNonceCache').has('nonce-valid-0000000001'));
    assert.deepEqual(JSON.parse(JSON.stringify(r.msg.payload)), { request: 'body' }, 'the caller payload is restored');
});

test('replay: the same presentation a second time -> 401 replay_detected', async () => {
    const g = new Map();
    const token = F.presentation({ nonce: 'nonce-replay-000000001' });
    assert.equal((await chain(token, { globalCtx: g })).port, 0);
    const again = await step('dsp-iam-prep', F.bearer(token), F.ENV, g);
    assert.equal(again.port, 1);
    assert.equal(code(again.msg), 'replay_detected');
});

test('a presentation refused later does not spend its nonce (no denial of service by bad tokens)', async () => {
    const g = new Map();
    const token = F.presentation({ nonce: 'nonce-unspent-00000001' });
    const r = await chain(token, { globalCtx: g, cpAnswer: { valid: false } });
    assert.equal(code(r.msg), 'invalid_signature');
    assert.ok(!(g.get('iamNonceCache') || new Map()).has('nonce-unspent-00000001'));
});

test('key binding signed by another key than the credential binds -> 401 holder_binding_failed', async () => {
    const r = await step('dsp-iam-prep', F.bearer(F.presentation({ kbKey: F.keys.other })));
    assert.equal(r.port, 1);
    assert.equal(code(r.msg), 'holder_binding_failed');
});

test('key binding that does not cover the presented disclosures -> 401 invalid_presentation', async () => {
    const c = F.credential();
    const r = await step('dsp-iam-prep', F.bearer(F.presentation({ credential: c, discs: [c.discs[0]] })));
    assert.equal(code(r.msg), 'invalid_presentation');
});

test('a disclosure the issuer did not commit to -> 401 invalid_presentation', async () => {
    const c = F.credential();
    const extra = F.b64u(['salt-x', 'participantRoles', ['data_provider']]);
    const discs = [c.discs[0], extra];
    const kbHash = F.sha256(c.ijwt + '~' + discs.map((d) => d + '~').join(''));
    const token = F.presentation({ credential: c, discs, kb: { sd_hash: kbHash } });
    assert.equal(code((await step('dsp-iam-prep', F.bearer(token))).msg), 'invalid_presentation');
});

test('no Bearer, not an SD-JWT presentation, no key binding -> 401', async () => {
    assert.equal(code((await step('dsp-iam-prep', { req: { headers: {} }, payload: {} })).msg), 'missing_authorization');
    assert.equal(code((await step('dsp-iam-prep', F.bearer('eyJhbGciOiJFUzI1NiJ9.e30.sig'))).msg), 'invalid_presentation');
    const c = F.credential();
    assert.equal(code((await step('dsp-iam-prep', F.bearer(c.ijwt + '~' + c.discs.join('~') + '~'))).msg), 'invalid_presentation');
});

test('audience, freshness and nonce of the key binding are enforced', async () => {
    assert.equal(code((await step('dsp-iam-prep', F.bearer(F.presentation({ kb: { aud: 'https://someone.else/dsp' } })))).msg), 'invalid_audience');
    const old = Math.floor(Date.now() / 1000) - 3600;
    assert.equal(code((await step('dsp-iam-prep', F.bearer(F.presentation({ kb: { iat: old } })))).msg), 'token_expired');
    assert.equal(code((await step('dsp-iam-prep', F.bearer(F.presentation({ kb: { nonce: 'short' } })))).msg), 'invalid_presentation');
});

test('the credential must be a participant credential, valid, naming a did:web participant, with a status entry', async () => {
    const t = (claims) => step('dsp-iam-prep', F.bearer(F.presentation({ claims })));
    assert.equal(code((await t({ vct: 'https://issuer.spec.local/vct/Other' })).msg), 'invalid_credential');
    assert.equal(code((await t({ exp: Math.floor(Date.now() / 1000) - 10 })).msg), 'token_expired');
    assert.equal(code((await t({ sub: 'did:jwk:abc' })).msg), 'invalid_credential');
    assert.equal(code((await t({ status: {} })).msg), 'invalid_credential');
});

test('missing settings fail closed (config_missing); DSP_IAM_ENFORCE=off is only an evidence mode', async () => {
    const token = F.presentation();
    for (const k of ['DSP_IAM_AUDIENCE', 'DSP_PARTICIPANT_VCT']) {
        const env = Object.assign({}, F.ENV, { [k]: '' });
        assert.equal(code((await step('dsp-iam-prep', F.bearer(token), env)).msg), 'config_missing');
    }
    const off = await step('dsp-iam-prep', F.bearer(token), Object.assign({}, F.ENV, { DSP_IAM_ENFORCE: 'off' }));
    assert.equal(off.port, 2);
    assert.equal(off.msg.identity, null);
    const vpOcm = await step('dsp-iam-prep-vp-ocm', { _iamVp: {} }, Object.assign({}, F.ENV, { OCM_CRYPTO_URL: '' }));
    assert.equal(code(vpOcm.msg), 'config_missing');
});

test('an issuer outside DSP_TRUSTED_ISSUERS -> 401 untrusted_issuer; an empty list refuses everything', async () => {
    const msg = (await step('dsp-iam-prep', F.bearer(F.presentation()))).msg;
    const env = Object.assign({}, F.ENV, { DSP_TRUSTED_ISSUERS: 'did:web:another.issuer' });
    assert.equal(code((await step('dsp-iam-trusted-issuer', JSON.parse(JSON.stringify(msg)), env)).msg), 'untrusted_issuer');
    const empty = Object.assign({}, F.ENV, { DSP_TRUSTED_ISSUERS: '' });
    assert.equal(code((await step('dsp-iam-trusted-issuer', JSON.parse(JSON.stringify(msg)), empty)).msg), 'untrusted_issuer');
});

test('crypto provider request: dc+sd-jwt, presentation in standard base64, the key binding audience and nonce', async () => {
    const token = F.presentation({ nonce: 'nonce-request-00000001' });
    const prep = await step('dsp-iam-prep', F.bearer(token));
    const r = await step('dsp-iam-prep-vp-ocm', prep.msg);
    assert.equal(r.msg.url, 'http://crypto.spec.local:8080/v1/presentation/verify');
    assert.equal(r.msg.headers['x-format'], 'dc+sd-jwt');
    assert.equal(Buffer.from(r.msg.payload.presentation, 'base64').toString('utf8'), token);
    assert.equal(r.msg.payload.aud, F.CONNECTOR_AUD);
    assert.equal(r.msg.payload.nonce, 'nonce-request-00000001');
});

test('crypto provider verdict: an error answer, valid false or another credential -> 401 invalid_signature', async () => {
    const token = F.presentation();
    for (const opts of [{ cpStatus: 400, cpAnswer: { message: 'Nonce not valid' } }, { cpAnswer: { valid: false } },
        { cpAnswer: { valid: true, disclosedCredential: { iss: 'did:web:x', sub: F.PARTICIPANT_DID } } }]) {
        assert.equal(code((await chain(token, opts)).msg), 'invalid_signature');
    }
});

test('status list: revoked entry -> 401 credential_revoked; foreign signature, wrong list or unavailable -> 401 status_unavailable', async () => {
    assert.equal(code((await chain(F.presentation({ idx: 3 }), { statusToken: F.statusListToken({ revoked: [3] }) })).msg), 'credential_revoked');
    assert.equal((await chain(F.presentation({ idx: 4 }), { statusToken: F.statusListToken({ revoked: [3] }) })).port, 0, 'another entry revoked: still valid');
    assert.equal(code((await chain(F.presentation(), { statusToken: F.statusListToken({ key: F.keys.other }) })).msg), 'status_unavailable');
    assert.equal(code((await chain(F.presentation(), { statusToken: F.statusListToken({ sub: 'https://issuer.spec.local/api/status/2' }) })).msg), 'status_unavailable');
    assert.equal(code((await chain(F.presentation(), { statusToken: '' })).msg), 'status_unavailable');
});

test('status list request asks for the token format (the W-Stack answers an empty body otherwise)', async () => {
    const prep = await step('dsp-iam-prep', F.bearer(F.presentation()));
    const vp = prep.msg._iamVp;
    const r = await step('dsp-iam-check-vp-ocm', Object.assign(prep.msg, { statusCode: 200, payload: { valid: true, disclosedCredential: { iss: vp.issuer, sub: vp.holderDid } } }));
    assert.equal(r.msg.url, F.STATUS_URI);
    assert.equal(r.msg.method, 'GET');
    assert.equal(r.msg.headers.accept, 'application/statuslist+jwt');
});

test('holder: a credential bound to a key that is not in the participant DID document -> 401 holder_binding_failed', async () => {
    const otherDoc = { id: F.PARTICIPANT_DID, verificationMethod: [{ id: F.PARTICIPANT_DID + '#k', publicKeyJwk: F.pub(F.keys.other) }] };
    assert.equal(code((await chain(F.presentation(), { participantDoc: otherDoc })).msg), 'holder_binding_failed');
});

test('DID resolution: did:web URLs, cached documents are not fetched again, a document for another DID is refused', async () => {
    const g = new Map();
    const prep = await step('dsp-iam-prep', F.bearer(F.presentation()), F.ENV, g);
    const first = await step('dsp-iam-resolve-dids', Object.assign(prep.msg, { statusCode: 200, payload: F.statusListToken() }), F.ENV, g);
    assert.equal(first.port, 0);
    assert.equal(first.msg.url, 'https://issuer.spec.local/.well-known/did.json');
    const wrong = await step('dsp-iam-resolve-dids', Object.assign(JSON.parse(JSON.stringify(first.msg)), { statusCode: 200, payload: F.participantDoc() }), F.ENV, new Map());
    assert.equal(code(wrong.msg), 'invalid_credential');
    const second = await step('dsp-iam-resolve-dids', Object.assign(first.msg, { statusCode: 200, payload: F.issuerDoc() }), F.ENV, g);
    assert.equal(second.msg.url, 'https://participant.spec.local/.well-known/did.json');
    const done = await step('dsp-iam-resolve-dids', Object.assign(second.msg, { statusCode: 200, payload: F.participantDoc() }), F.ENV, g);
    assert.equal(done.port, 1);
    // a second presentation resolves nothing: both documents are cached
    const prep2 = await step('dsp-iam-prep', F.bearer(F.presentation()), F.ENV, g);
    const cached = await step('dsp-iam-resolve-dids', Object.assign(prep2.msg, { statusCode: 200, payload: F.statusListToken() }), F.ENV, g);
    assert.equal(cached.port, 1);
});
