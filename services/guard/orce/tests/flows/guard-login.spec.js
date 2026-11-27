/* eslint-disable */
//
// guard-login.spec.js — tests the guard's login provider by executing the
// real `func` of each function node of facis-guard-login.json (run-node.js,
// shared with the DSP connector tests). A login is driven node by node: the
// test plays the HTTP request nodes (authorization server, verifier, status
// list, policy engine) by feeding each node the reply the next hop would get.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const path = require('node:path');
const { runNode } = require('../../../../dsp-connector/orce/tests/harness/run-node.js');

const FLOW = path.join(__dirname, '../../flows/facis-guard-login.json');
// values built inside the sandbox have the sandbox's prototypes: compare plain copies
const deq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual === undefined ? null : actual)), expected, message);
const qrcode = { toString: async (text) => '<svg data-qr="' + encodeURIComponent(text) + '"></svg>' };

const ENV = {
    GUARD_HYDRA_ADMIN_URL: 'http://guard-hydra-admin:4445',
    GUARD_POLICY_URL: 'http://policy-engine:8181/v1/data/facis/login/allow',
    GUARD_VERIFIER_URL: 'http://credential-verification-service:8080',
    GUARD_VERIFIER_TENANT: 'fap',
    GUARD_VERIFIER_PERMISSION_SET: 'facis-login',
    GUARD_FIRST_PARTY_CLIENTS: 'facis-ai-insight-ui,facis-dashboard',
    GUARD_STATUS_LIST_ORIGINS: 'https://status.example.org',
    GUARD_WEB_WALLETS: JSON.stringify([{ name: 'Cloud wallet', url: 'https://wallet.example.org/present?request={openid4vp}' }])
};
const HOLDER = 'did:key:z6MkHolder';
const ORG = 'did:web:org-a.example.org';
const ISSUER = 'did:web:issuer.example.org';
const VERIFIER_CLIENT = 'x509_san_dns:verifier.example.org';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => b64u({ alg: 'ES256', typ: 'JWT' }) + '.' + b64u(payload) + '.c2ln';

function ctx(env) {
    return { env: Object.assign({}, ENV, env || {}), globalCtx: new Map(), flowCtx: new Map() };
}
async function run(c, id, msg, libs) {
    return runNode(FLOW, id, { msg, env: c.env, globalCtx: c.globalCtx, flowCtx: c.flowCtx, libs: Object.assign({ qrcode }, libs || {}) });
}
const req = (query, headers) => ({ req: { query: query || {}, headers: headers || {}, ip: '10.0.0.9', method: 'GET' } });

async function configured(env) {
    const c = ctx(env);
    await run(c, 'guard-config', {});
    return c;
}

// Drives a login up to the login page; returns the attempt id.
async function startLogin(c, opts) {
    opts = opts || {};
    let r = await run(c, 'guard-login-start', req({ login_challenge: 'chal-1' }, { 'x-forwarded-for': '203.0.113.7' }));
    assert.ok(r.result[0], 'login start passes');
    let m = r.result[0];
    m.statusCode = 200;
    m.payload = { challenge: 'chal-1', client: { client_id: opts.client || 'facis-ai-insight-ui' }, skip: false };
    r = await run(c, 'guard-login-request', m);
    if (!r.result[0]) return { refused: r.result[1] };
    m = r.result[0];
    m.statusCode = 201;
    m.payload = { presentationId: 'state-1', requestId: 'req-1', authorizationUrl: 'openid4vp://?request_uri=https%3A%2F%2Fverifier.example.org%2Fro&client_id=' + encodeURIComponent(VERIFIER_CLIENT), requestUri: 'https://verifier.example.org/ro' };
    r = await run(c, 'guard-verifier-created', m);
    m = r.result[0];
    m.statusCode = 200;
    m.payload = jwt({ nonce: 'nonce-1', client_id: VERIFIER_CLIENT, dcql_query: { credentials: [{ id: 'role' }] } });
    r = await run(c, 'guard-attempt-create', m);
    const page = r.sent[0][0];
    const attempts = c.flowCtx.get('guardAttempts');
    const id = Object.keys(attempts).find((k) => attempts[k].challenge === 'chal-1' && attempts[k].status === 'pending');
    return { page, id, attempt: attempts[id] };
}

function roleVcJwt(over) {
    const o = Object.assign({ iss: ISSUER, sub: HOLDER, exp: Math.floor(Date.now() / 1000) + 3600 }, over || {});
    return jwt(Object.assign({
        vc: {
            type: ['VerifiableCredential', 'FapIotAiRoleCredential'],
            issuer: ISSUER,
            credentialSubject: { id: HOLDER, name: 'Test Person', email: 'person@example.org', org_did: ORG, roles: ['data_analyst'], purposes: ['analytics'] },
            credentialStatus: { type: 'BitstringStatusListEntry', statusPurpose: 'revocation', statusListIndex: '5', statusListCredential: 'https://status.example.org/v1/tenants/fap/status/list-1' }
        }
    }, o));
}
function record(vp, over) {
    return Object.assign({ status: 'presentation-received', requestId: 'req-1', presentation: { role: [vp] } }, over || {});
}
function vpJwt(over) {
    return jwt(Object.assign({ iss: HOLDER, aud: VERIFIER_CLIENT, nonce: 'nonce-1', vp: { holder: HOLDER, verifiableCredential: [roleVcJwt()] } }, over || {}));
}

async function poll(c, id, rec, code) {
    let r = await run(c, 'guard-status-start', req({ attempt: id }));
    if (!r.result[0]) return { answer: r.result[1] };
    const m = r.result[0];
    m.statusCode = code || 200;
    m.payload = rec;
    r = await run(c, 'guard-status-record', m);
    return { next: r.result[0], refused: r.result[1], answer: r.result[2] };
}
function statusList(bitIndex) {
    const bytes = Buffer.alloc(16);
    if (bitIndex !== undefined) bytes[Math.floor(bitIndex / 8)] |= 1 << (7 - (bitIndex % 8));
    return JSON.stringify({ list: zlib.deflateSync(bytes).toString('base64url') });
}

// --- configuration ---------------------------------------------------------------

test('config: valid environment is published as guardConfig, verifier 1.3 body', async () => {
    const c = await configured();
    const cfg = c.globalCtx.get('guardConfig');
    assert.equal(cfg.ok, true, cfg.errors.join('; '));
    deq(cfg.verifier.createBody, { permissionSet: 'facis-login', ttl: 300 });
    assert.equal(cfg.verifier.createPath, '/v1/tenants/fap/internal/presentations/authorization');
    deq(cfg.statusListOrigins, ['https://status.example.org']);
});

test('config: verifier 1.2 profile sends the policy id and the client id', async () => {
    const c = await configured({ GUARD_VERIFIER_API: 'cvs-1.2', GUARD_VERIFIER_POLICY_ID: 'pol-1', GUARD_VERIFIER_CLIENT_ID: 'did:web:fap.example.org' });
    const cfg = c.globalCtx.get('guardConfig');
    assert.equal(cfg.ok, true, cfg.errors.join('; '));
    deq(cfg.verifier.createBody, { presentationPolicyId: 'pol-1', clientId: 'did:web:fap.example.org', ttl: 300 });
});

test('config: missing and invalid values fail closed, and every node refuses', async () => {
    const c = await configured({ GUARD_HYDRA_ADMIN_URL: '', GUARD_VERIFIER_API: 'cvs-9', GUARD_WEB_WALLETS: '[{"name":"x","url":"http://x"}]', GUARD_STATUS_LIST_ORIGINS: '' });
    const cfg = c.globalCtx.get('guardConfig');
    assert.equal(cfg.ok, false);
    assert.ok(cfg.errors.some((e) => e.includes('GUARD_HYDRA_ADMIN_URL')));
    assert.ok(cfg.errors.some((e) => e.includes('GUARD_VERIFIER_API')));
    assert.ok(cfg.errors.some((e) => e.includes('GUARD_WEB_WALLETS')));
    assert.ok(cfg.errors.some((e) => e.includes('GUARD_STATUS_LIST_ORIGINS')));
    const r = await run(c, 'guard-login-start', req({ login_challenge: 'chal-1' }));
    assert.equal(r.result[1]._guardError.code, 503);
    const h = await run(c, 'guard-health', req());
    assert.equal(h.result.statusCode, 503);
});

// --- login start and page --------------------------------------------------------

test('login start: malformed challenge is refused with a page, not forwarded', async () => {
    const c = await configured();
    const r = await run(c, 'guard-login-start', req({ login_challenge: 'bad challenge<>' }));
    assert.equal(r.result[0], null);
    assert.equal(r.result[1]._guardError.code, 400);
});

test('login start: client address is the right-most forwarded entry (one trusted proxy)', async () => {
    const c = await configured();
    const r = await run(c, 'guard-login-start', req({ login_challenge: 'chal-1' }, { 'x-forwarded-for': '198.51.100.1, 203.0.113.7' }));
    assert.equal(r.result[0]._guard.addr, '203.0.113.7');
    assert.equal(r.result[0].url, 'http://guard-hydra-admin:4445/admin/oauth2/auth/requests/login?login_challenge=chal-1');
});

test('login request: a client that is not first-party is refused', async () => {
    const c = await configured();
    const s = await startLogin(c, { client: 'someone-else' });
    assert.equal(s.refused._guardError.code, 403);
});

test('login page: QR code, same-device link, web wallet, strict CSP with a script nonce', async () => {
    const c = await configured();
    const s = await startLogin(c);
    assert.equal(s.page.statusCode, 200);
    const html = s.page.payload;
    assert.ok(html.includes('data-qr="openid4vp'), 'QR code of the request link');
    assert.ok(html.includes('href="openid4vp://?request_uri='), 'same-device link');
    assert.ok(html.includes('https://wallet.example.org/present?request=openid4vp%3A%2F%2F'), 'web wallet redirect carries the encoded link');
    const csp = s.page.headers['content-security-policy'];
    const nonce = /'nonce-([^']+)'/.exec(csp)[1];
    assert.ok(html.includes('<script nonce="' + nonce + '">'));
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.equal(s.attempt.nonce, 'nonce-1');
    deq(s.attempt.dcqlIds, ['role']);
    assert.equal(s.attempt.addr, '203.0.113.7');
});

test('login page: starting again supersedes the pending attempt of the same login request', async () => {
    const c = await configured();
    const first = await startLogin(c);
    const second = await startLogin(c);
    const attempts = c.flowCtx.get('guardAttempts');
    assert.equal(attempts[first.id], undefined);
    assert.ok(attempts[second.id]);
});

test('verifier: an unusable create reply or request object gives an error page', async () => {
    const c = await configured();
    let r = await run(c, 'guard-verifier-created', { _guard: {}, statusCode: 201, payload: { presentationId: 's', requestId: 'r', authorizationUrl: 'https://not-a-wallet-link' } });
    assert.equal(r.result[1]._guardError.code, 502);
    r = await run(c, 'guard-attempt-create', { _guard: { challenge: 'c' }, statusCode: 200, payload: jwt({ client_id: 'x' }) });
    assert.equal(r.sent[0][1]._guardError.code, 502);
});

// --- status: presentation checks ------------------------------------------------

test('status: nothing stored yet (409) answers pending and frees the attempt', async () => {
    const c = await configured();
    const s = await startLogin(c);
    const p = await poll(c, s.id, { error: 'not yet' }, 409);
    deq(p.answer.payload, { state: 'pending' });
    assert.equal(c.flowCtx.get('guardAttempts')[s.id].busy, false);
});

test('status: a valid JWT presentation goes on to the status list of the credential', async () => {
    const c = await configured();
    const s = await startLogin(c);
    const p = await poll(c, s.id, record(vpJwt()));
    assert.ok(p.next, 'not refused: ' + JSON.stringify(p.refused && p.refused._guard.refusal));
    assert.equal(p.next.url, 'https://status.example.org/v1/tenants/fap/status/list-1');
    assert.equal(p.next._guard.holder, HOLDER);
    assert.equal(p.next._guard.statusIndex, 5);
    deq(p.next._guard.credential.roles, ['data_analyst']);
    assert.equal(p.next._guard.credential.issuer, ISSUER);
});

test('status: a valid JSON (ldp) presentation is accepted too', async () => {
    const c = await configured();
    const s = await startLogin(c);
    const vc = { issuer: ISSUER, credentialSubject: { id: HOLDER, org_did: ORG, roles: ['operator'] },
        credentialStatus: { type: 'BitstringStatusListEntry', statusPurpose: 'revocation', statusListIndex: '3', statusListCredential: 'https://status.example.org/l/2' } };
    const vp = { holder: HOLDER, verifiableCredential: [vc], proof: { challenge: 'nonce-1', domain: VERIFIER_CLIENT, verificationMethod: HOLDER + '#key-1' } };
    const p = await poll(c, s.id, record(vp));
    assert.ok(p.next, JSON.stringify(p.refused && p.refused._guard.refusal));
    assert.equal(p.next._guard.statusIndex, 3);
});

const refusals = [
    ['record not verified', () => record(vpJwt(), { status: 'presentation-pending' }), 'not verified'],
    ['record of another request', () => record(vpJwt(), { requestId: 'req-other' }), 'another request'],
    ['query outside the request', () => ({ status: 'presentation-received', requestId: 'req-1', presentation: { other: [vpJwt()] } }), 'outside this request'],
    ['wrong nonce', () => record(vpJwt({ nonce: 'nonce-x' })), 'nonce'],
    ['wrong audience', () => record(vpJwt({ aud: 'did:web:someone-else' })), 'audience'],
    ['credential of another holder', () => record(vpJwt({ vp: { verifiableCredential: [roleVcJwt({ sub: 'did:key:z6MkOther', vc: { issuer: ISSUER, credentialSubject: { id: 'did:key:z6MkOther', org_did: ORG, roles: ['data_analyst'] } } })] } })), 'holder binding'],
    ['expired credential', () => record(vpJwt({ vp: { verifiableCredential: [roleVcJwt({ exp: 1000 })] } })), 'expired'],
    ['no role credential', () => record(vpJwt({ vp: { verifiableCredential: [jwt({ iss: ISSUER, sub: HOLDER, vc: { credentialSubject: { id: HOLDER } } })] } })), 'no role credential'],
    ['unsupported format', () => record('not-a-presentation'), 'format'],
    ['status list on another origin', () => record(vpJwt({ vp: { verifiableCredential: [roleVcJwt({ vc: { issuer: ISSUER, credentialSubject: { id: HOLDER, org_did: ORG, roles: ['data_analyst'] }, credentialStatus: { type: 'BitstringStatusListEntry', statusPurpose: 'revocation', statusListIndex: '1', statusListCredential: 'https://attacker.example.net/list' } } })] } })), 'origin not allowed'],
    ['no status entry', () => record(vpJwt({ vp: { verifiableCredential: [roleVcJwt({ vc: { issuer: ISSUER, credentialSubject: { id: HOLDER, org_did: ORG, roles: ['data_analyst'] } } })] } })), 'status entry']
];
for (const [name, rec, reason] of refusals) {
    test('status: refused — ' + name, async () => {
        const c = await configured();
        const s = await startLogin(c);
        const p = await poll(c, s.id, rec());
        assert.ok(p.refused, 'expected a refusal');
        assert.ok(p.refused._guard.refusal.reason.includes(reason), p.refused._guard.refusal.reason);
    });
}

test('status: an expired attempt answers expired and never reaches the verifier', async () => {
    const c = await configured();
    const s = await startLogin(c);
    c.flowCtx.get('guardAttempts')[s.id].expires = Date.now() - 1;
    const p = await poll(c, s.id, record(vpJwt()));
    deq(p.answer.payload, { state: 'expired' });
});

test('status: unknown or malformed attempt ids', async () => {
    const c = await configured();
    let p = await poll(c, 'f'.repeat(64), {});
    assert.equal(p.answer.statusCode, 404);
    p = await poll(c, '../x', {});
    assert.equal(p.answer.statusCode, 400);
});

// --- status list, policy, accept --------------------------------------------------

async function toStatusList(c) {
    const s = await startLogin(c);
    const p = await poll(c, s.id, record(vpJwt()));
    return { s, m: p.next };
}

test('status list: bit set (revoked) is refused, bit clear asks the login policy', async () => {
    let c = await configured();
    let { m } = await toStatusList(c);
    m.statusCode = 200;
    m.payload = statusList(5);
    let r = await run(c, 'guard-status-list', m);
    assert.ok(r.result[1]._guard.refusal.reason.includes('revoked'));

    c = await configured();
    ({ m } = await toStatusList(c));
    m.statusCode = 200;
    m.payload = statusList(4);   // another index revoked, ours clear
    r = await run(c, 'guard-status-list', m);
    assert.ok(r.result[0]);
    assert.equal(r.result[0].url, ENV.GUARD_POLICY_URL);
    deq(JSON.parse(r.result[0].payload).input, { org_did: ORG, roles: ['data_analyst'], issuer: ISSUER, client_id: 'facis-ai-insight-ui' });
});

test('status list: W3C encodedList (gzip, multibase u) and IETF token status list (LSB first)', async () => {
    let c = await configured();
    let { m } = await toStatusList(c);
    const bytes = Buffer.alloc(16); bytes[0] = 1 << (7 - 5);
    m.statusCode = 200;
    m.payload = jwt({ vc: { credentialSubject: { encodedList: 'u' + zlib.gzipSync(bytes).toString('base64url') } } });
    let r = await run(c, 'guard-status-list', m);
    assert.ok(r.result[1], 'W3C list: index 5 revoked');

    c = await configured();
    ({ m } = await toStatusList(c));
    const t = Buffer.alloc(16); t[0] = 1 << 5;   // IETF: index 5 is bit 5 from the right
    m.statusCode = 200;
    m.payload = jwt({ status_list: { bits: 1, lst: zlib.deflateSync(t).toString('base64url') } });
    r = await run(c, 'guard-status-list', m);
    assert.ok(r.result[1], 'IETF list: index 5 revoked');
});

test('status list: unavailable or unreadable is refused without counting as a failure', async () => {
    const c = await configured();
    const { m } = await toStatusList(c);
    m.statusCode = 503;
    const r = await run(c, 'guard-status-list', m);
    assert.equal(r.result[1]._guard.refusal.countsAsFailure, false);
});

test('policy: deny refuses; allow accepts the login with the holder as subject and the claims in the context', async () => {
    const c = await configured();
    const { m } = await toStatusList(c);
    m.statusCode = 200; m.payload = statusList();
    const pm = (await run(c, 'guard-status-list', m)).result[0];

    const deny = Object.assign({}, pm, { _guard: Object.assign({}, pm._guard), statusCode: 200, payload: { result: { allow: false, reason: 'issuer not trusted for this organisation' } } });
    let r = await run(c, 'guard-policy-decision', deny);
    assert.ok(r.result[1]._guard.refusal.reason.includes('issuer not trusted'));

    pm.statusCode = 200; pm.payload = { result: { allow: true, reason: 'ok' } };
    r = await run(c, 'guard-policy-decision', pm);
    const acc = r.result[0];
    assert.equal(acc.method, 'PUT');
    assert.ok(acc.url.endsWith('/admin/oauth2/auth/requests/login/accept?login_challenge=chal-1'));
    const body = JSON.parse(acc.payload);
    assert.equal(body.subject, HOLDER);
    assert.equal(body.remember, false);
    deq(body.context.claims, { org_did: ORG, roles: ['data_analyst'], purpose: ['analytics'] });
    deq(body.context.display, { name: 'Test Person', email: 'person@example.org' });

    acc.statusCode = 200; acc.payload = { redirect_to: 'https://login.example.org/oauth2/auth?login_verifier=v' };
    r = await run(c, 'guard-login-accepted', acc);
    deq(r.result.payload, { state: 'done', redirect_to: 'https://login.example.org/oauth2/auth?login_verifier=v' });
    // the attempt is over: a further poll answers from the attempt, not the verifier
    const again = await poll(c, pm._guard.attemptId, record(vpJwt()));
    assert.equal(again.answer.payload.state, 'done');
});

test('policy engine unavailable: refused, not counted as a failure', async () => {
    const c = await configured();
    const { m } = await toStatusList(c);
    m.statusCode = 200; m.payload = statusList();
    const pm = (await run(c, 'guard-status-list', m)).result[0];
    pm.statusCode = 502; pm.payload = 'bad gateway';
    const r = await run(c, 'guard-policy-decision', pm);
    assert.equal(r.result[1]._guard.refusal.countsAsFailure, false);
});

// --- refusals and lockout --------------------------------------------------------

test('lockout: five counted refusals lock the address and the holder; the next start is paused', async () => {
    const c = await configured();
    for (let i = 0; i < 5; i++) {
        const s = await startLogin(c);
        const p = await poll(c, s.id, record(vpJwt({ nonce: 'wrong' })));
        p.refused._guard.holder = HOLDER;
        const r = await run(c, 'guard-refuse', p.refused);
        assert.equal(r.result.payload.state, 'refused');
    }
    const locks = c.flowCtx.get('guardLockouts');
    assert.ok(locks['addr:203.0.113.7'].until > Date.now());
    assert.ok(locks['holder:' + HOLDER].until > Date.now());
    const r = await run(c, 'guard-login-start', req({ login_challenge: 'chal-2' }, { 'x-forwarded-for': '203.0.113.7' }));
    assert.equal(r.result[1]._guardError.code, 429);
});

test('lockout: platform failures are not counted', async () => {
    const c = await configured();
    for (let i = 0; i < 6; i++) {
        const s = await startLogin(c);
        await run(c, 'guard-refuse', { _guard: { attemptId: s.id, refusal: { reason: 'policy engine unavailable', countsAsFailure: false } } });
    }
    deq(c.flowCtx.get('guardLockouts') || {}, {});
});

test('admin lockouts: disabled without a token, bearer required, list and lift', async () => {
    let c = await configured();
    let r = await run(c, 'guard-admin-lockouts', req());
    assert.equal(r.result.statusCode, 503);

    c = await configured({ GUARD_ADMIN_TOKEN: 't0ken' });
    c.flowCtx.set('guardLockouts', { 'addr:203.0.113.7': { failures: [], until: Date.now() + 60000 } });
    r = await run(c, 'guard-admin-lockouts', req({}, { authorization: 'Bearer wrong' }));
    assert.equal(r.result.statusCode, 401);
    r = await run(c, 'guard-admin-lockouts', req({}, { authorization: 'Bearer t0ken' }));
    assert.equal(r.result.payload.lockouts.length, 1);
    const del = req({ key: 'addr:203.0.113.7' }, { authorization: 'Bearer t0ken' });
    del.req.method = 'DELETE';
    r = await run(c, 'guard-admin-lockouts', del);
    assert.equal(r.result.payload.lifted, true);
    deq(c.flowCtx.get('guardLockouts'), {});
});

// --- consent and logout ------------------------------------------------------------

test('consent: first-party client gets the verified claims in its tokens, without a page', async () => {
    const c = await configured();
    let r = await run(c, 'guard-consent-start', req({ consent_challenge: 'cons-1' }));
    const m = r.result[0];
    m.statusCode = 200;
    m.payload = { client: { client_id: 'facis-ai-insight-ui' }, requested_scope: ['openid'], requested_access_token_audience: ['facis-ai-insight'],
        context: { claims: { org_did: ORG, roles: ['data_analyst'], purpose: ['analytics'] }, display: { name: 'Test Person' } } };
    r = await run(c, 'guard-consent-accept', m);
    const acc = r.result[0];
    assert.ok(acc.url.endsWith('/consent/accept?consent_challenge=cons-1'));
    const body = JSON.parse(acc.payload);
    deq(body.session.access_token, { org_did: ORG, roles: ['data_analyst'], purpose: ['analytics'] });
    assert.equal(body.session.id_token.name, 'Test Person');
    assert.equal(body.session.access_token.name, undefined, 'display claims stay out of the access token');
    deq(body.grant_access_token_audience, ['facis-ai-insight']);

    acc.statusCode = 200; acc.payload = { redirect_to: 'https://app.example.org/cb?code=x' };
    r = await run(c, 'guard-redirect', acc);
    assert.equal(r.result[0].statusCode, 302);
    assert.equal(r.result[0].headers.location, 'https://app.example.org/cb?code=x');
});

test('consent: another client, or no verified claims, is rejected', async () => {
    const c = await configured();
    for (const payload of [
        { client: { client_id: 'third-party' }, context: { claims: { org_did: ORG, roles: [] } } },
        { client: { client_id: 'facis-ai-insight-ui' }, context: {} }
    ]) {
        const r = await run(c, 'guard-consent-accept', { _guard: { consentChallenge: 'cons-2' }, statusCode: 200, payload });
        assert.ok(r.result[0].url.endsWith('/consent/reject?consent_challenge=cons-2'));
    }
});

test('logout: the logout request is accepted and the browser redirected', async () => {
    const c = await configured();
    const r = await run(c, 'guard-logout-start', req({ logout_challenge: 'out-1' }));
    assert.equal(r.result[0].method, 'PUT');
    assert.ok(r.result[0].url.endsWith('/logout/accept?logout_challenge=out-1'));
});

test('error landing: the authorization server error is shown escaped, never as markup', async () => {
    const c = await configured();
    let r = await run(c, 'guard-error-landing', req({ error: 'access_denied', error_description: '<script>x</script> refused' }));
    r = await run(c, 'guard-error-page', r.result);
    assert.equal(r.result.statusCode, 400);
    assert.ok(r.result.payload.includes('&lt;script&gt;x&lt;/script&gt; refused (access_denied)'));
    assert.ok(!r.result.payload.includes('<script>x'));
});

test('challenges: the authorization server\'s long challenges are accepted, the alphabet is still checked', async () => {
    const c = await configured();
    const long = 'A'.repeat(560) + '-_' + 'b'.repeat(566);   // 1128 characters, as Hydra v26 issues them
    let r = await run(c, 'guard-login-start', req({ login_challenge: long }));
    assert.ok(r.result[0], 'long login challenge forwarded');
    assert.ok(r.result[0].url.endsWith('login_challenge=' + long));
    r = await run(c, 'guard-consent-start', req({ consent_challenge: long }));
    assert.ok(r.result[0], 'long consent challenge forwarded');
    r = await run(c, 'guard-logout-start', req({ logout_challenge: long }));
    assert.ok(r.result[0], 'long logout challenge forwarded');
    r = await run(c, 'guard-login-start', req({ login_challenge: 'x'.repeat(4097) }));
    assert.equal(r.result[1]._guardError.code, 400, 'beyond the upper bound');
    r = await run(c, 'guard-login-start', req({ login_challenge: long + '"><' }));
    assert.equal(r.result[1]._guardError.code, 400, 'outside the alphabet');
});

test('lockout: a successful login clears the failure counts of its address and holder', async () => {
    const c = await configured();
    async function refusal() {
        const s = await startLogin(c);
        const p = await poll(c, s.id, record(vpJwt({ nonce: 'wrong' })));
        p.refused._guard.holder = HOLDER;
        await run(c, 'guard-refuse', p.refused);
    }
    for (let i = 0; i < 4; i++) await refusal();
    assert.equal(c.flowCtx.get('guardLockouts')['addr:203.0.113.7'].failures.length, 4);
    // a successful login
    const { m } = await toStatusList(c);
    m.statusCode = 200; m.payload = statusList();
    const pm = (await run(c, 'guard-status-list', m)).result[0];
    pm.statusCode = 200; pm.payload = { result: { allow: true } };
    const acc = (await run(c, 'guard-policy-decision', pm)).result[0];
    acc.statusCode = 200; acc.payload = { redirect_to: 'https://login.example.org/oauth2/auth?login_verifier=v' };
    await run(c, 'guard-login-accepted', acc);
    const locks = c.flowCtx.get('guardLockouts');
    assert.equal(locks['addr:203.0.113.7'], undefined, 'address counts cleared');
    assert.equal(locks['holder:' + HOLDER], undefined, 'holder counts cleared');
    // one more refusal does not lock: the count starts again
    await refusal();
    assert.ok(!(c.flowCtx.get('guardLockouts')['addr:203.0.113.7'].until > Date.now()));
});

test('lockout: a lockout in force is not lifted by a login of another attempt', async () => {
    const c = await configured();
    const s = await startLogin(c);
    c.flowCtx.set('guardLockouts', { ['holder:' + HOLDER]: { failures: [], until: Date.now() + 60000 } });
    const acc = { _guard: { attemptId: s.id, holder: HOLDER, credential: { org_did: ORG } }, statusCode: 200, payload: { redirect_to: 'https://x.example.org/' } };
    await run(c, 'guard-login-accepted', acc);
    assert.ok(c.flowCtx.get('guardLockouts')['holder:' + HOLDER].until > Date.now());
});

// --- SD-JWT VC presentations (dc+sd-jwt, with key binding) -------------------------

const nodeCrypto = require('node:crypto');
function sdJwtPresentation(opts) {
    opts = opts || {};
    const holderKey = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = holderKey.publicKey.export({ format: 'jwk' });
    const signKey = opts.kbKey || holderKey.privateKey;
    const disc = (arr) => Buffer.from(JSON.stringify(arr)).toString('base64url');
    const dig = (d) => nodeCrypto.createHash('sha256').update(d, 'ascii').digest('base64url');
    const roles = opts.roles || ['data_analyst'];
    const roleDiscs = roles.map((r) => disc([nodeCrypto.randomBytes(8).toString('hex'), r]));
    const claimDiscs = {
        org_did: disc(['s1', 'org_did', ORG]),
        roles: disc(['s2', 'roles', roleDiscs.map((d) => ({ '...': dig(d) }))]),
        name: disc(['s3', 'name', 'Test Person']),
        email: disc(['s4', 'email', 'person@example.org']),
        purposes: disc(['s5', 'purposes', ['analytics']])
    };
    const issuerPayload = Object.assign({
        iss: ISSUER, vct: 'FapIotAiRoleCredential', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
        cnf: { jwk }, _sd_alg: 'sha-256', _sd: Object.values(claimDiscs).map(dig),
        status: { status_list: { idx: 5, uri: 'https://status.example.org/v1/tenants/fap/status/list-1' } }
    }, opts.issuer || {});
    const ijwt = jwt(issuerPayload);
    const discs = Object.values(claimDiscs).concat(roleDiscs).concat(opts.extraDisclosures || []);
    const presented = ijwt + '~' + discs.map((d) => d + '~').join('');
    const kbPayload = Object.assign({ nonce: 'nonce-1', aud: VERIFIER_CLIENT, iat: Math.floor(Date.now() / 1000), sd_hash: dig(presented) }, opts.kb || {});
    const head = b64u({ alg: 'ES256', typ: 'kb+jwt' }) + '.' + b64u(kbPayload);
    const sig = nodeCrypto.sign('sha256', Buffer.from(head), { key: signKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const holder = 'did:jwk:' + Buffer.from(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y })).toString('base64url');
    return { compact: presented + head + '.' + sig, holder };
}

test('SD-JWT VC: a valid presentation gives the disclosed claims and the bound key as holder', async () => {
    const c = await configured();
    const s = await startLogin(c);
    const sd = sdJwtPresentation({ roles: ['data_analyst', 'operator'] });
    const p = await poll(c, s.id, record(sd.compact));
    assert.ok(p.next, JSON.stringify(p.refused && p.refused._guard.refusal));
    assert.equal(p.next._guard.holder, sd.holder);
    deq(p.next._guard.credential.roles, ['data_analyst', 'operator']);
    assert.equal(p.next._guard.credential.org_did, ORG);
    assert.equal(p.next._guard.credential.issuer, ISSUER);
    assert.equal(p.next._guard.credential.name, 'Test Person');
    assert.equal(p.next._guard.statusIndex, 5);
    assert.equal(p.next.url, 'https://status.example.org/v1/tenants/fap/status/list-1');
});

const sdRefusals = [
    ['wrong nonce in the key binding', { kb: { nonce: 'other' } }, 'nonce'],
    ['wrong audience in the key binding', { kb: { aud: 'did:web:someone-else' } }, 'audience'],
    ['key binding over other disclosures', { kb: { sd_hash: 'AAAA' } }, 'cover the presented disclosures'],
    ['key binding signed by another key', { kbKey: nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey }, 'not signed by the holder key'],
    ['a disclosure the issuer did not commit to', { extraDisclosures: [Buffer.from(JSON.stringify(['x', 'roles', ['administrator']])).toString('base64url')] }, 'not committed'],
    ['no bound holder key', { issuer: { cnf: undefined } }, 'binds no holder key'],
    ['expired credential', { issuer: { exp: 1000 } }, 'expired'],
    ['subject that is not the bound key', { issuer: { sub: 'did:key:z6MkSomeoneElse' } }, 'not the bound key']
];
for (const [name, opts, reason] of sdRefusals) {
    test('SD-JWT VC: refused — ' + name, async () => {
        const c = await configured();
        const s = await startLogin(c);
        const p = await poll(c, s.id, record(sdJwtPresentation(opts).compact));
        assert.ok(p.refused, 'expected a refusal');
        assert.ok(p.refused._guard.refusal.reason.includes(reason), p.refused._guard.refusal.reason);
    });
}

test('SD-JWT VC: no key-binding JWT is refused', async () => {
    const c = await configured();
    const s = await startLogin(c);
    const compact = sdJwtPresentation().compact;
    const p = await poll(c, s.id, record(compact.slice(0, compact.lastIndexOf('~') + 1)));
    assert.ok(p.refused._guard.refusal.reason.includes('no key binding'));
});

test('status: a presentation the verifier rejected ends the attempt at once', async () => {
    const c = await configured();
    const s = await startLogin(c);
    const p = await poll(c, s.id, { status: 'presentation-rejected', error: 'verified presentation not yet available' }, 409);
    assert.ok(p.refused, 'refused');
    assert.ok(p.refused._guard.refusal.reason.includes('rejected by the verifier'));
});

test('status list: one media type is asked, the configured one', async () => {
    let c = await configured();
    let s = await startLogin(c);
    let p = await poll(c, s.id, record(vpJwt()));
    assert.equal(p.next.headers.accept, 'application/vnd.xfsc.status-list');
    c = await configured({ GUARD_STATUS_LIST_ACCEPT: 'application/statuslist+jwt' });
    s = await startLogin(c);
    p = await poll(c, s.id, record(vpJwt()));
    assert.equal(p.next.headers.accept, 'application/statuslist+jwt');
});

test('look: the login and error pages carry the FACIS logo and the shared styles', async () => {
    const c = await configured();
    await run(c, 'guard-brand', {});
    const brand = c.globalCtx.get('guardBrand');
    assert.ok(brand.logo.startsWith('data:image/svg+xml;base64,'), 'logo embedded');
    assert.ok(brand.css.includes('--primary:#005FFF'));
    const s = await startLogin(c);
    assert.ok(s.page.payload.includes('<img class="logo" src="data:image/svg+xml;base64,'));
    assert.ok(s.page.payload.includes('<main class="card">'));
    assert.ok(s.page.payload.includes('class="button secondary"'));
    let r = await run(c, 'guard-error-landing', req({ error: 'access_denied' }));
    r = await run(c, 'guard-error-page', r.result);
    assert.ok(r.result.payload.includes('<img class="logo"'));
    assert.ok(r.result.headers['content-security-policy'].includes('img-src data:'));
});
