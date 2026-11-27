// The status list of the presented credential. Accepted shapes:
//   - W-Stack status service: {"list": base64url(zlib)}, bit index 0 is the
//     left-most bit of byte 0 (as in the W3C Bitstring Status List);
//   - W3C Bitstring Status List credential (JSON or JWT): credentialSubject.
//     encodedList = multibase "u" + base64url(gzip), same bit order;
//   - IETF Token Status List (JWT): status_list {bits, lst = base64url(zlib)},
//     entries read from the least significant bit.
// Any error, a missing list or an index beyond it refuses the login (the
// credential's non-revocation cannot be shown). Then asks the policy engine.
// libs: zlib. Outputs: 1 = policy request, 2 = refusal.
const cfg = global.get('guardConfig');
const g = msg._guard || {};
const attempts = flow.get('guardAttempts') || {};
const a = attempts[g.attemptId];
const refuse = (reason, counts) => {
    g.refusal = { reason, countsAsFailure: counts !== false };
    return [null, msg];
};
if (!cfg || !cfg.ok || !a) return refuse('configuration or attempt missing', false);
if (msg.statusCode !== 200) return refuse('credential status list unavailable', false);

const jwtPayload = (s) => {
    const parts = String(s).trim().split('.');
    if (parts.length !== 3) return null;
    try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch (e) { return null; }
};
let body = msg.payload;
if (Buffer.isBuffer(body)) body = body.toString('utf8');
let doc = null;
if (typeof body === 'string') {
    const t = body.trim();
    if (t.startsWith('{')) { try { doc = JSON.parse(t); } catch (e) { doc = null; } } else { doc = jwtPayload(t); }
} else if (body && typeof body === 'object') {
    doc = body;
}
if (!doc || typeof doc !== 'object') return refuse('credential status list not readable', false);

let bytes = null;
let bits = 1;
let lsbFirst = false;
try {
    const subj = (doc.vc && doc.vc.credentialSubject) || doc.credentialSubject;
    if (typeof doc.list === 'string') {
        bytes = zlib.unzipSync(Buffer.from(doc.list, 'base64url'));
    } else if (subj && typeof subj.encodedList === 'string') {
        const enc = subj.encodedList.startsWith('u') ? subj.encodedList.slice(1) : subj.encodedList;
        bytes = zlib.unzipSync(Buffer.from(enc, 'base64url'));
    } else if (doc.status_list && typeof doc.status_list.lst === 'string') {
        bits = Number(doc.status_list.bits);
        if (![1, 2, 4, 8].includes(bits)) return refuse('credential status list not readable', false);
        bytes = zlib.unzipSync(Buffer.from(doc.status_list.lst, 'base64url'));
        lsbFirst = true;
    }
} catch (e) {
    bytes = null;
}
if (!bytes) return refuse('credential status list not readable', false);

const index = g.statusIndex;
const bitPos = index * bits;
const byteAt = Math.floor(bitPos / 8);
if (!Number.isInteger(index) || index < 0 || byteAt >= bytes.length) return refuse('credential status index outside the list', false);
const shift = lsbFirst ? (bitPos % 8) : (8 - bits - (bitPos % 8));
const value = (bytes[byteAt] >> shift) & ((1 << bits) - 1);
if (value !== 0) return refuse('credential revoked or suspended');

msg.method = 'POST';
msg.url = cfg.policyUrl;
msg.headers = { 'content-type': 'application/json', accept: 'application/json' };
msg.payload = JSON.stringify({
    input: {
        org_did: g.credential.org_did,
        roles: g.credential.roles,
        issuer: g.credential.issuer,
        client_id: a.appClient
    }
});
return [msg, null];
