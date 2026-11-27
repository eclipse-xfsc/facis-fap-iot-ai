/* eslint-disable */
//
// sdjwt-fixtures.js — SD-JWT VC test material for the DSP identity specs: an
// issuer and a participant with did:web documents, a participant credential
// (dc+sd-jwt, selectively disclosed claims, holder key in cnf.jwk), its
// presentation with a key-binding JWT, and an IETF Token Status List token.
// Everything is signed with keys generated per run (node:crypto, ES256).
//
const crypto = require('crypto');
const zlib = require('zlib');

const ISSUER_DID = 'did:web:issuer.spec.local';
const PARTICIPANT_DID = 'did:web:participant.spec.local';
const CONNECTOR_AUD = 'https://provider.spec.local/dsp';
const VCT = 'https://issuer.spec.local/vct/FacisParticipantCredential';
const STATUS_URI = 'https://issuer.spec.local/api/status/1';

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s, 'ascii').digest('base64url');
const pub = (k) => { const j = k.publicKey.export({ format: 'jwk' }); return { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; };
const newKey = () => crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
function signJwt(header, payload, key) {
    const input = b64u(header) + '.' + b64u(payload);
    return input + '.' + crypto.sign('sha256', Buffer.from(input), { key: key.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}

const keys = { issuer: newKey(), participant: newKey(), other: newKey() };
const didDoc = (did, key, frag) => ({
    id: did,
    verificationMethod: [{ id: did + '#' + frag, type: 'JsonWebKey2020', controller: did, publicKeyJwk: pub(key) }]
});
const issuerDoc = () => didDoc(ISSUER_DID, keys.issuer, 'key-1');
const participantDoc = () => didDoc(PARTICIPANT_DID, keys.participant, 'eckey');

// The participant credential: legalName and participantRoles are disclosures.
function credential(opts = {}) {
    const discs = [
        b64u(['salt-1', 'legalName', opts.legalName || 'Example Participant']),
        b64u(['salt-2', 'participantRoles', opts.roles || ['data_consumer']])
    ];
    const now = Math.floor(Date.now() / 1000);
    const payload = Object.assign({
        iss: ISSUER_DID,
        sub: PARTICIPANT_DID,
        vct: VCT,
        iat: now,
        exp: now + 3600,
        cnf: { jwk: pub(opts.holderKey || keys.participant) },
        status: { status_list: { idx: opts.idx === undefined ? 3 : opts.idx, uri: STATUS_URI } },
        _sd_alg: 'sha-256',
        _sd: discs.map(sha256)
    }, opts.claims || {});
    const ijwt = signJwt({ alg: 'ES256', typ: 'dc+sd-jwt', kid: ISSUER_DID + '#key-1' }, payload, keys.issuer);
    return { ijwt, discs, payload };
}

// A presentation: credential + disclosures + key-binding JWT.
function presentation(opts = {}) {
    const c = opts.credential || credential(opts);
    const discs = opts.discs || c.discs;
    const presented = c.ijwt + '~' + discs.map((d) => d + '~').join('');
    const kb = Object.assign({
        iat: Math.floor(Date.now() / 1000),
        aud: CONNECTOR_AUD,
        nonce: opts.nonce || crypto.randomUUID(),
        sd_hash: sha256(c.ijwt + '~' + c.discs.map((d) => d + '~').join(''))
    }, opts.kb || {});
    return presented + signJwt({ alg: 'ES256', typ: 'kb+jwt' }, kb, opts.kbKey || keys.participant);
}

// IETF Token Status List token; revoked = indexes set to 1.
function statusListToken(opts = {}) {
    const bytes = Buffer.alloc(16, 0);
    for (const i of opts.revoked || []) bytes[Math.floor(i / 8)] |= 1 << (i % 8);
    const now = Math.floor(Date.now() / 1000);
    return signJwt({ alg: 'ES256', typ: 'statuslist+jwt', kid: opts.kid || ISSUER_DID + '#key-1' }, {
        iss: 'https://issuer.spec.local/api/status',
        sub: opts.sub || STATUS_URI,
        iat: now,
        exp: now + 3600,
        status_list: { bits: 1, lst: zlib.deflateSync(bytes).toString('base64url') }
    }, opts.key || keys.issuer);
}

const ENV = {
    DSP_IAM_AUDIENCE: CONNECTOR_AUD,
    DSP_PARTICIPANT_VCT: VCT,
    DSP_TRUSTED_ISSUERS: ISSUER_DID,
    OCM_CRYPTO_URL: 'http://crypto.spec.local:8080'
};
const bearer = (token) => ({ req: { headers: { authorization: 'Bearer ' + token }, params: {} }, res: { set() {} }, payload: { request: 'body' } });

module.exports = {
    ISSUER_DID, PARTICIPANT_DID, CONNECTOR_AUD, VCT, STATUS_URI, ENV, keys, pub,
    issuerDoc, participantDoc, credential, presentation, statusListToken, bearer, signJwt, b64u, sha256,
};
