// Stub of the W-Stack credential verifier, for local tests of the guard only.
// Never deploy it anywhere else: it signs nothing and verifies nothing.
//
// It serves the routes the login provider calls (the same in the verifier
// releases 1.2.x and 1.3.x):
//   POST /v1/tenants/:t/internal/presentations/authorization   create a request
//   GET  /v1/tenants/:t/presentation/proof/:state/request-object/request.jwt
//   GET  /v1/tenants/:t/internal/presentations/:state          409 until presented
// plus what a wallet and an issuer would provide:
//   POST /stub/present  {state, roles, org_did, issuer, holder, purposes,
//                        revoked, tamper: "nonce"|"audience"|"holder"}
//        stores a presentation (JWT VP with one role credential) as verified
//   GET  /stub/pending  the latest request not presented yet ({state}), for a
//        login opened in a browser (present.sh)
//   GET  /status/list-1 the status list of the stub credentials ({"list": ...})
//   GET  /healthz
// Node.js 18+, no dependencies.
'use strict';
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = Number(process.env.PORT || 8080);
const SELF = (process.env.STUB_INTERNAL_URL || 'http://localhost:' + PORT).replace(/\/+$/, '');
const VERIFIER_CLIENT_ID = process.env.STUB_CLIENT_ID || 'did:web:verifier.local.test';
const requests = new Map();          // state -> {requestId, nonce, clientId, record}
const revoked = new Set();           // status list indices set to 1
let nextIndex = 1;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => b64u({ alg: 'ES256', typ: 'JWT' }) + '.' + b64u(payload) + '.' + crypto.randomBytes(16).toString('base64url');
const send = (res, code, body, type) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(code, { 'content-type': type || 'application/json', 'content-length': Buffer.byteLength(data) });
    res.end(data);
};
const readJson = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1 << 20) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve(null); } });
});

http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    const p = url.pathname;
    let m;
    if (req.method === 'GET' && p === '/healthz') return send(res, 200, { status: 'ok' });

    if (req.method === 'POST' && (m = p.match(/^\/v1\/tenants\/([^/]+)\/internal\/presentations\/authorization$/))) {
        if (!req.headers['x-groupid']) return send(res, 400, { error: 'tenantId and x-groupid required' });
        const body = await readJson(req);
        if (!body || !(body.permissionSet || (body.presentationPolicyId && body.clientId))) {
            return send(res, 400, { error: 'permissionSet (1.3) or presentationPolicyId and clientId (1.2) required' });
        }
        const state = crypto.randomBytes(16).toString('hex');
        const clientId = body.clientId || VERIFIER_CLIENT_ID;
        requests.set(state, { requestId: crypto.randomUUID(), nonce: crypto.randomBytes(16).toString('hex'), clientId, record: null });
        const requestUri = SELF + '/v1/tenants/' + m[1] + '/presentation/proof/' + state + '/request-object/request.jwt';
        const link = 'openid4vp://?' + new URLSearchParams({ request_uri: requestUri, client_id: clientId }).toString();
        return send(res, 201, { presentationId: state, requestId: requests.get(state).requestId, authorizationUrl: link, requestUri, ttl: body.ttl || 300 });
    }
    if (req.method === 'GET' && (m = p.match(/^\/v1\/tenants\/[^/]+\/presentation\/proof\/([^/]+)\/request-object\/request\.jwt$/))) {
        const r = requests.get(m[1]);
        if (!r) return send(res, 404, { error: 'unknown request' });
        return send(res, 200, jwt({ nonce: r.nonce, client_id: r.clientId, response_mode: 'direct_post',
            dcql_query: { credentials: [{ id: 'role', format: 'jwt_vc_json' }] } }), 'application/oauth-authz-req+jwt');
    }
    if (req.method === 'GET' && (m = p.match(/^\/v1\/tenants\/[^/]+\/internal\/presentations\/([^/]+)$/))) {
        const r = requests.get(m[1]);
        if (!r) return send(res, 404, { error: 'unknown presentation' });
        if (!r.record) return send(res, 409, { status: 'presentation-pending', error: 'verified presentation not yet available' });
        return send(res, 200, r.record);
    }
    if (req.method === 'POST' && p === '/stub/present') {
        const b = await readJson(req);
        const r = b && requests.get(b.state);
        if (!r) return send(res, 404, { error: 'unknown state' });
        const holder = b.holder || 'did:key:z6MkLocalTestHolder';
        const index = nextIndex++;
        if (b.revoked) revoked.add(index);
        const now = Math.floor(Date.now() / 1000);
        const vc = jwt({
            iss: b.issuer, sub: b.tamper === 'holder' ? 'did:key:z6MkSomeoneElse' : holder, iat: now, exp: now + 3600,
            vc: {
                type: ['VerifiableCredential', 'FapIotAiRoleCredential'], issuer: b.issuer,
                credentialSubject: { id: b.tamper === 'holder' ? 'did:key:z6MkSomeoneElse' : holder, name: 'Local Test', email: 'local.test@example.org',
                    org_did: b.org_did, roles: b.roles || [], purposes: b.purposes || ['analytics'] },
                credentialStatus: { type: 'BitstringStatusListEntry', statusPurpose: 'revocation', statusListIndex: String(index),
                    statusListCredential: SELF + '/status/list-1' }
            }
        });
        const vp = jwt({ iss: holder, aud: b.tamper === 'audience' ? 'did:web:another-verifier' : r.clientId,
            nonce: b.tamper === 'nonce' ? 'another-nonce' : r.nonce, iat: now, vp: { holder, verifiableCredential: [vc] } });
        r.record = { presentationId: b.state, requestId: r.requestId, status: 'presentation-received', presentation: { role: [vp] } };
        return send(res, 200, { stored: true, statusListIndex: index });
    }
    if (req.method === 'GET' && p === '/stub/pending') {
        const pending = [...requests.entries()].filter(([, r]) => !r.record);
        if (pending.length === 0) return send(res, 404, { error: 'no pending request' });
        return send(res, 200, { state: pending[pending.length - 1][0] });
    }
    if (req.method === 'GET' && p === '/status/list-1') {
        const bytes = Buffer.alloc(16384);
        for (const i of revoked) bytes[i >> 3] |= 1 << (7 - (i & 7));
        return send(res, 200, { list: zlib.deflateSync(bytes).toString('base64url') });
    }
    send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log('stub verifier on :' + PORT + ' (' + SELF + ')'));
