// The verifier's stored presentation for this attempt. The verifier checks
// the signatures, the nonce and the audience; this node checks again what
// binds the presentation to this attempt and to its holder, from the stored
// record only (never from what the wallet answered):
//   - the record is verified and belongs to this attempt's request;
//   - it answers this request's DCQL query ids, and nothing else;
//   - the presentation's nonce and audience are this request's;
//   - holder binding: the presentation is signed by the credential subject;
//   - one role credential with an organisation DID and roles;
//   - the credential carries a status entry on an allowed status list origin.
// Supports SD-JWT VC presentations (dc+sd-jwt, with key binding), JSON
// presentations (ldp_vp) and JWT presentations (jwt_vp_json); any other format
// is refused. For SD-JWT VC, the claims come from the disclosures the issuer
// committed to (_sd digests), the holder is the key bound in the credential
// (cnf.jwk, as did:jwk), and the key-binding JWT must carry this request's
// nonce and audience, cover exactly what was presented (sd_hash) and be signed
// by that bound key.
// Outputs: 1 = status list fetch, 2 = refusal, 3 = JSON answer (pending/error).
const cfg = global.get('guardConfig');
const attempts = flow.get('guardAttempts') || {};
const id = (msg._guard || {}).attemptId;
const a = attempts[id];
const answer = (code, body) => {
    if (a) { a.busy = false; flow.set('guardAttempts', attempts); }
    msg.statusCode = code;
    msg.headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    delete msg.cookies;
    msg.payload = body;
    return [null, null, msg];
};
const refuse = (reason, counts) => {
    msg._guard.refusal = { reason, countsAsFailure: counts !== false };
    return [null, msg, null];
};
if (!cfg || !cfg.ok || !a) return answer(503, { state: 'error' });

// a presentation the verifier recorded as rejected ends the attempt now
if (msg.statusCode === 409 && msg.payload && typeof msg.payload === 'object' && msg.payload.status === cfg.verifier.rejectedStatus) {
    return refuse('presentation rejected by the verifier');
}
if (cfg.verifier.pendingCodes.includes(msg.statusCode)) return answer(200, { state: 'pending' });
if (msg.statusCode !== 200 || !msg.payload || typeof msg.payload !== 'object') {
    node.log(JSON.stringify({ event: 'guard.verifier.error', step: 'record', http: msg.statusCode }));
    return answer(200, { state: 'pending' });
}
const rec = msg.payload;
const eq = (x, y) => typeof x === 'string' && typeof y === 'string' && x.length === y.length &&
    crypto.timingSafeEqual(Buffer.from(x), Buffer.from(y));
const didOf = (ref) => (typeof ref === 'string' ? ref.split('#')[0] : (ref && typeof ref.id === 'string' ? ref.id.split('#')[0] : null));
const jwtPayload = (s) => {
    if (typeof s !== 'string') return null;
    const parts = s.trim().split('.');
    if (parts.length !== 3) return null;
    try { const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); return p && typeof p === 'object' ? p : null; } catch (e) { return null; }
};
const asJson = (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim().startsWith('{')) {
        try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
    }
    return null;
};

if (rec.status !== cfg.verifier.verifiedStatus) return refuse('presentation not verified by the verifier');
if (!eq(rec.requestId, a.requestId)) return refuse('presentation belongs to another request');
const pres = rec.presentation;
if (!pres || typeof pres !== 'object' || Array.isArray(pres) || Object.keys(pres).length === 0) return refuse('no presentation in the verifier record');
const keys = Object.keys(pres);
if (!keys.every((k) => a.dcqlIds.includes(k))) return refuse('presentation answers queries outside this request');

const b64json = (s) => { try { return JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8')); } catch (e) { return null; } };
const sha256 = (s) => crypto.createHash('sha256').update(s, 'ascii').digest('base64url');
// SD-JWT VC: returns {vp} or {error}
const sdJwt = (compact) => {
    const parts = compact.trim().split('~');
    if (parts.length < 2) return { error: 'SD-JWT presentation not readable' };
    const kb = parts.pop();
    if (!kb) return { error: 'SD-JWT presentation has no key binding' };
    const [ijwt, ...discs] = parts;
    const ip = jwtPayload(ijwt);
    const kp = jwtPayload(kb);
    if (!ip || !kp) return { error: 'SD-JWT presentation not readable' };
    if ((ip._sd_alg || 'sha-256') !== 'sha-256') return { error: 'SD-JWT digest algorithm not supported' };
    if (!eq(kp.sd_hash, sha256(ijwt + '~' + discs.map((d) => d + '~').join('')))) return { error: 'key binding does not cover the presented disclosures' };
    // claims: only disclosures whose digest the issuer signed
    const byDigest = {};
    for (const d of discs) {
        const arr = b64json(d);
        if (!Array.isArray(arr) || (arr.length !== 3 && arr.length !== 2)) return { error: 'SD-JWT disclosure not readable' };
        byDigest[sha256(d)] = arr;
    }
    const used = new Set();
    const resolve = (v) => {
        if (Array.isArray(v)) {
            const out = [];
            for (const x of v) {
                if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && typeof x['...'] === 'string') {
                    const dd = byDigest[x['...']];
                    if (dd && dd.length === 2) { used.add(x['...']); out.push(resolve(dd[1])); }
                } else out.push(resolve(x));
            }
            return out;
        }
        if (v && typeof v === 'object') {
            const out = {};
            for (const [k, x] of Object.entries(v)) if (k !== '_sd' && k !== '_sd_alg') out[k] = resolve(x);
            for (const dg of Array.isArray(v._sd) ? v._sd : []) {
                const dd = byDigest[dg];
                if (dd && dd.length === 3 && !['_sd', '...'].includes(dd[1])) { used.add(dg); out[dd[1]] = resolve(dd[2]); }
            }
            return out;
        }
        return v;
    };
    const claims = resolve(ip);
    if (used.size !== Object.keys(byDigest).length) return { error: 'SD-JWT disclosure not committed by the issuer' };
    const jwk = ip.cnf && ip.cnf.jwk;
    if (!jwk || typeof jwk !== 'object') return { error: 'SD-JWT credential binds no holder key' };
    // the key-binding JWT is signed by the bound key
    try {
        const [h, pl, sig] = kb.split('.');
        const alg = (b64json(h) || {}).alg;
        const algs = { ES256: 'sha256', ES384: 'sha384', ES512: 'sha512', EdDSA: null };
        if (!Object.prototype.hasOwnProperty.call(algs, alg)) return { error: 'key binding algorithm not supported' };
        const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
        const ok = crypto.verify(algs[alg], Buffer.from(h + '.' + pl), alg === 'EdDSA' ? key : { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
        if (!ok) return { error: 'key binding not signed by the holder key' };
    } catch (e) {
        return { error: 'key binding not verifiable' };
    }
    const pub = {};
    for (const k of ['kty', 'crv', 'x', 'y', 'n', 'e']) if (jwk[k] !== undefined) pub[k] = jwk[k];
    const holder = 'did:jwk:' + Buffer.from(JSON.stringify(pub)).toString('base64url');
    if (claims.sub !== undefined && !eq(didOf(claims.sub), holder)) return { error: 'holder binding: credential subject is not the bound key' };
    return { vp: { nonce: kp.nonce, aud: kp.aud, holder, vcs: [{ issuer: didOf(ip.iss) || ip.iss, subject: Object.assign({}, claims, { id: holder }),
        status: claims.status, exp: ip.exp, nbf: ip.nbf }] } };
};

// Normalise every presented VP into {nonce, aud, holder, vcs: [{issuer, subject, status, exp, nbf}]}
const vps = [];
for (const k of keys) {
    const entries = Array.isArray(pres[k]) ? pres[k] : [pres[k]];
    for (const e of entries) {
        if (typeof e === 'string' && e.includes('~')) {
            const r = sdJwt(e);
            if (r.error) return refuse(r.error);
            vps.push(r.vp);
            continue;
        }
        const j = jwtPayload(e);
        if (j && j.vp) {
            const vcs = (Array.isArray(j.vp.verifiableCredential) ? j.vp.verifiableCredential : [j.vp.verifiableCredential]).map((c) => {
                const cj = jwtPayload(c);
                if (cj && cj.vc) {
                    const subj = Array.isArray(cj.vc.credentialSubject) ? cj.vc.credentialSubject[0] : cj.vc.credentialSubject;
                    return { issuer: didOf(cj.iss || cj.vc.issuer), subject: Object.assign({}, subj, { id: (subj && subj.id) || cj.sub }),
                        status: cj.vc.credentialStatus, exp: cj.exp, nbf: cj.nbf };
                }
                return null;
            });
            vps.push({ nonce: j.nonce, aud: j.aud, holder: didOf(j.iss || j.vp.holder), vcs });
            continue;
        }
        const o = asJson(e);
        if (o && o.proof) {
            const proofs = Array.isArray(o.proof) ? o.proof : [o.proof];
            const p0 = proofs[0] || {};
            const vcs = (Array.isArray(o.verifiableCredential) ? o.verifiableCredential : [o.verifiableCredential]).map((c) => {
                const co = asJson(c);
                if (!co) return null;
                const subj = Array.isArray(co.credentialSubject) ? co.credentialSubject[0] : co.credentialSubject;
                const exp = co.validUntil || co.expirationDate;
                return { issuer: didOf(co.issuer), subject: subj, status: co.credentialStatus,
                    exp: exp ? Math.floor(Date.parse(exp) / 1000) : undefined };
            });
            vps.push({ nonce: p0.challenge, aud: p0.domain || p0.audience, holder: didOf(o.holder || p0.verificationMethod),
                signer: didOf(p0.verificationMethod), vcs });
            continue;
        }
        return refuse('presentation format not supported');
    }
}

let role = null;
const nowS = Math.floor(Date.now() / 1000);
for (const vp of vps) {
    if (!eq(vp.nonce, a.nonce)) return refuse('presentation nonce does not match this request');
    const audOk = Array.isArray(vp.aud) ? vp.aud.some((x) => eq(x, a.verifierClientId)) : eq(vp.aud, a.verifierClientId);
    if (!audOk) return refuse('presentation audience does not match this request');
    if (!vp.holder || (vp.signer && !eq(vp.signer, vp.holder))) return refuse('presentation holder is not its signer');
    for (const vc of vp.vcs) {
        if (!vc || !vc.subject || typeof vc.subject !== 'object') return refuse('presented credential not readable');
        if (!eq(vc.subject.id, vp.holder)) return refuse('holder binding: credential subject is not the presenter');
        if (typeof vc.exp === 'number' && vc.exp < nowS) return refuse('presented credential expired');
        if (typeof vc.nbf === 'number' && vc.nbf > nowS + 60) return refuse('presented credential not yet valid');
        if (!role && typeof vc.subject.org_did === 'string' && Array.isArray(vc.subject.roles)) role = { vc, holder: vp.holder };
    }
}
if (!role) return refuse('no role credential presented');

// holder lockout (the address lockout was checked when the attempt started)
const locks = flow.get('guardLockouts') || {};
const hl = locks['holder:' + role.holder];
if (hl && hl.until > Date.now()) return refuse('holder locked out after repeated failures', false);

// status entry: Bitstring Status List or Token Status List shape
const st = Array.isArray(role.vc.status) ? role.vc.status : (role.vc.status ? [role.vc.status] : []);
if (st.length !== 1) return refuse('credential must carry exactly one status entry');
const s0 = st[0];
const ref = s0.statusListCredential || (s0.status_list && s0.status_list.uri);
const idx = s0.statusListCredential ? s0.statusListIndex : (s0.status_list && s0.status_list.idx);
const index = typeof idx === 'number' ? idx : (/^[0-9]{1,9}$/.test(String(idx)) ? Number(idx) : -1);
let statusUrl = null;
try { statusUrl = new url.URL(String(ref)); } catch (e) { statusUrl = null; }
if (!statusUrl || index < 0) return refuse('credential status entry not readable');
if (!cfg.statusListOrigins.includes(statusUrl.origin)) return refuse('credential status list origin not allowed');

msg._guard.holder = role.holder;
msg._guard.credential = {
    issuer: role.vc.issuer,
    org_did: role.vc.subject.org_did,
    roles: role.vc.subject.roles.filter((r) => typeof r === 'string'),
    purpose: Array.isArray(role.vc.subject.purposes) ? role.vc.subject.purposes.filter((p) => typeof p === 'string') : [],
    name: typeof role.vc.subject.name === 'string' ? role.vc.subject.name : undefined,
    email: typeof role.vc.subject.email === 'string' ? role.vc.subject.email : undefined
};
msg._guard.statusIndex = index;
msg.method = 'GET';
msg.url = statusUrl.href;
msg.headers = { accept: cfg.statusListAccept };
msg.payload = '';
return [msg, null, null];
