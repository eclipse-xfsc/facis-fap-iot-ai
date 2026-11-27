#!/usr/bin/env node
// Test wallet for the guard's local checks. Never a real wallet: it keeps its
// key and credentials in a plain file and has no user interface.
//
//   receive <credential-offer-uri>       OID4VCI, pre-authorized code: token,
//        nonce, proof of the holder key (ES256), credential. The credential is
//        stored in the wallet file.
//   present <openid4vp-link> [case-json] OID4VP with DCQL, response mode
//        direct_post: fetches the request object, selects a stored credential
//        matching the query, presents it (SD-JWT VC with a key-binding JWT),
//        posts it to the verifier. Exits 0 once the verifier took it, 4 when the
//        verifier refused it, 3 for a case it cannot play (see below), 1 on an error.
//   holder                               prints the holder DID (did:jwk).
//   has <roles-json>                     exit 0 if an SD-JWT credential with exactly
//        those roles is stored, 1 otherwise.
//
// case-json (the e2e check's cases): {"roles": [...]} selects a credential with
// exactly those roles; {"tamper": "nonce"|"audience"|"holder"} makes that one
// part wrong on purpose; "revoked" and "issuer" are not played (exit 3).
//
// Env: WALLET_FILE   wallet file (default ./.test-wallet.json)
//      WALLET_ORIGIN_MAP  "https://a=https://b,..." rewrites URLs before each
//                     request (a local W-Stack serving its public URLs elsewhere)
//      WALLET_INSECURE=1  do not check TLS certificates (local only)
// Node.js 18+, no dependencies.
'use strict';
const crypto = require('crypto');
const fs = require('fs');

const FILE = process.env.WALLET_FILE || '.test-wallet.json';
if (process.env.WALLET_INSECURE === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const originMap = (process.env.WALLET_ORIGIN_MAP || '').split(',').filter(Boolean).map((p) => p.split('='));
const mapUrl = (u) => originMap.reduce((acc, [from, to]) => (acc.startsWith(from) ? to + acc.slice(from.length) : acc), u);

const b64u = (b) => Buffer.from(b).toString('base64url');
const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const sha256 = (s) => crypto.createHash('sha256').update(s, 'ascii').digest('base64url');

function load() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { /* new wallet */ }
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const w = { key: privateKey.export({ format: 'jwk' }), credentials: [] };
    save(w);
    return w;
}
function save(w) { fs.writeFileSync(FILE, JSON.stringify(w, null, 2), { mode: 0o600 }); }
const pub = (jwk) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
const did = (jwk) => 'did:jwk:' + b64u(JSON.stringify(pub(jwk)));
function sign(jwk, header, payload) {
    const input = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(payload));
    const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
    return input + '.' + b64u(crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }));
}

async function http(method, url, opts) {
    opts = opts || {};
    const r = await fetch(mapUrl(url), { method, headers: opts.headers || {}, body: opts.body, redirect: 'manual' });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!r.ok && !opts.allowError) throw new Error(method + ' ' + url + ': HTTP ' + r.status + ' ' + text.slice(0, 300));
    return { status: r.status, text, json };
}
const form = (o) => new URLSearchParams(o).toString();
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

async function receive(offerUri) {
    const w = load();
    const q = new URL(offerUri.replace(/^openid-credential-offer:\/\//, 'https://x/')).searchParams;
    const offer = q.get('credential_offer') ? JSON.parse(q.get('credential_offer'))
        : (await http('GET', q.get('credential_offer_uri'))).json;
    const issuer = offer.credential_issuer.replace(/\/$/, '');
    const md = (await http('GET', issuer + '/.well-known/openid-credential-issuer')).json;
    const as = (md.authorization_servers && md.authorization_servers[0]) || issuer;
    let tokenEndpoint = null;
    for (const p of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
        const r = await http('GET', as.replace(/\/$/, '') + p, { allowError: true });
        if (r.json && r.json.token_endpoint) { tokenEndpoint = r.json.token_endpoint; break; }
    }
    if (!tokenEndpoint) throw new Error('no token endpoint for ' + as);
    const grant = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
    const tok = (await http('POST', tokenEndpoint, { headers: FORM, body: form({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code', 'pre-authorized_code': grant['pre-authorized_code'] }) })).json;
    const configId = offer.credential_configuration_ids[0];
    const conf = md.credential_configurations_supported[configId] || {};
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        let nonce = tok.c_nonce;
        if (md.nonce_endpoint) nonce = (await http('POST', md.nonce_endpoint)).json.c_nonce;
        const proof = sign(w.key, { typ: 'openid4vci-proof+jwt', alg: 'ES256', jwk: pub(w.key) },
            { aud: offer.credential_issuer, iat: Math.floor(Date.now() / 1000), nonce });
        const r = await http('POST', md.credential_endpoint, { allowError: true,
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok.access_token },
            body: JSON.stringify({ credential_configuration_id: configId, proofs: { jwt: [proof] } }) });
        if (r.status === 200 && r.json) {
            const cred = (r.json.credentials && r.json.credentials[0] && r.json.credentials[0].credential) || r.json.credential;
            w.credentials.push({ configuration: configId, format: conf.format, vct: conf.vct, credential: cred, received: new Date().toISOString() });
            save(w);
            console.log(JSON.stringify({ received: configId, format: conf.format, holder: did(w.key) }));
            return;
        }
        last = r;
        await new Promise((res) => setTimeout(res, 2000));
    }
    throw new Error('credential endpoint: HTTP ' + last.status + ' ' + last.text.slice(0, 300));
}

function sdClaims(compact) {
    const [ijwt, ...rest] = compact.split('~');
    const p = b64json(ijwt.split('.')[1]);
    const out = Object.assign({}, p);
    for (const d of rest.filter(Boolean)) {
        const a = b64json(d);
        if (a.length === 3) out[a[1]] = a[2];
    }
    if (Array.isArray(out.roles)) {
        const vals = {};
        for (const d of rest.filter(Boolean)) { const a = b64json(d); if (a.length === 2) vals[sha256(d)] = a[1]; }
        out.roles = out.roles.map((x) => (x && x['...'] ? vals[x['...']] : x)).filter((x) => x !== undefined);
    }
    return out;
}

async function present(link, caseJson) {
    const c = caseJson ? JSON.parse(caseJson) : {};
    if (c.revoked || c.issuer) { console.error('case not played by this wallet: ' + (c.revoked ? 'revoked' : 'issuer')); process.exit(3); }
    const w = load();
    const q = new URL(link.replace(/^openid4vp:\/\//, 'https://x/')).searchParams;
    const ro = await http('GET', q.get('request_uri'));
    const req = b64json(ro.text.trim().split('.')[1]);
    const query = (req.dcql_query && req.dcql_query.credentials || [])[0];
    if (!query) throw new Error('request has no DCQL credential query');
    const want = c.roles ? JSON.stringify([...c.roles].sort()) : null;
    const cred = [...w.credentials].reverse().find((x) => x.format === 'dc+sd-jwt' && x.format === query.format &&
        (!query.meta || !query.meta.vct_values || query.meta.vct_values.includes(x.vct)) &&
        (!want || JSON.stringify([...(sdClaims(x.credential).roles || [])].sort()) === want));
    if (!cred) { console.error('no stored credential matches the query' + (want ? ' with roles ' + want : '')); process.exit(3); }
    const presented = cred.credential.endsWith('~') ? cred.credential : cred.credential + '~';
    const kbKey = c.tamper === 'holder' ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }) : w.key;
    const kb = sign(kbKey, { typ: 'kb+jwt', alg: 'ES256' }, {
        nonce: c.tamper === 'nonce' ? 'another-nonce' : req.nonce,
        aud: c.tamper === 'audience' ? 'did:web:another-verifier.example' : req.client_id,
        iat: Math.floor(Date.now() / 1000), sd_hash: sha256(presented) });
    const vpToken = { [query.id]: [presented + kb] };
    const r = await http('POST', req.response_uri, { allowError: true, headers: FORM,
        body: form({ vp_token: JSON.stringify(vpToken), state: req.state || '' }) });
    console.log(JSON.stringify({ posted: query.id, http: r.status, holder: did(w.key) }));
    // a verifier that refuses the presentation answers an error: the login then fails, which is the point
    if (r.status >= 400) process.exit(4);
}

function has(rolesJson) {
    const want = JSON.stringify([...JSON.parse(rolesJson)].sort());
    const ok = load().credentials.some((x) => x.format === 'dc+sd-jwt' && JSON.stringify([...(sdClaims(x.credential).roles || [])].sort()) === want);
    process.exit(ok ? 0 : 1);
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'has') has(a1);
const run = cmd === 'receive' ? receive(a1) : cmd === 'present' ? present(a1, a2) : cmd === 'holder' ? Promise.resolve(console.log(did(load().key))) : null;
if (!run) { console.error('usage: test-wallet.js receive <offer-uri> | present <openid4vp-link> [case-json] | holder | has <roles-json>'); process.exit(2); }
run.catch((e) => { console.error(e.message); process.exit(1); });
