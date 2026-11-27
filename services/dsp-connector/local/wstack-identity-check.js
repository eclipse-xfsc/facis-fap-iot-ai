#!/usr/bin/env node
// The connector's identity flows against a real W-Stack (see
// wstack-identity-check.sh, which sets everything up and calls this):
//   1. accept: the participant credential offered by the issuer is accepted
//      into the tenant's wallet (facis-dsp-iam-receive.json);
//   2. a second offer, from an issuer the connector does not trust, is refused;
//   3. present: iam.issue takes the credential from the tenant's storage and
//      has the crypto provider add the key binding for a counterparty;
//   4. verify: that counterparty's iam.verify accepts it, with the issuer's
//      signature, the status list and the participant's DID checked live;
//   5. refusals: the same presentation again (replay), and the presentation
//      with a key binding signed by another key.
// Env: OFFER, OFFER_UNTRUSTED (openid-credential-offer:// links), TENANT_DID,
//      CRYPTO_URL, STORAGE_URL, RETRIEVAL_URL, TENANT, ACCOUNT, REGION,
//      COUNTRY, KEY_NAMESPACE, KEY_GROUP, KEY, ISSUE_CONFIGURATION, and
//      NODE_EXTRA_CA_CERTS for the tenant host's certificate.
const crypto = require('crypto');
const { run } = require('./flow-run.js');

const need = (k) => { const v = process.env[k]; if (!v) { console.error('set ' + k); process.exit(2); } return v; };
const TENANT_DID = need('TENANT_DID');
const tenantUrl = 'https://' + TENANT_DID.slice('did:web:'.length).split(':').map(decodeURIComponent).join('/');
const AUD = 'https://provider.local.test/dsp';
let pass = 0, fail = 0;
const check = (ok, what, detail) => {
    if (ok) { pass++; console.log('  ok    ' + what); } else { fail++; console.log('  FAIL  ' + what + (detail ? ': ' + detail : '')); }
};
const reason = (m) => JSON.stringify((m && m.payload) || null).slice(0, 300);

(async () => {
    const meta = await (await fetch(tenantUrl + '/.well-known/openid-credential-issuer')).json();
    const conf = (meta.credential_configurations_supported || {})[need('ISSUE_CONFIGURATION')] || {};
    if (conf.format !== 'dc+sd-jwt' || !conf.vct) { console.error('the issuer configuration is not an SD-JWT VC'); process.exit(2); }
    const ADMIN = crypto.randomBytes(24).toString('hex');
    const env = {
        DSP_ADMIN_TOKEN: ADMIN,
        DSP_TRUSTED_ISSUERS: TENANT_DID,
        DSP_PARTICIPANT_VCT: conf.vct,
        DSP_IAM_AUDIENCE: AUD,
        OCM_RETRIEVAL_URL: need('RETRIEVAL_URL'),
        OCM_STORAGE_URL: need('STORAGE_URL'),
        OCM_CRYPTO_URL: need('CRYPTO_URL'),
        OCM_TENANT: need('TENANT'),
        OCM_ACCOUNT: need('ACCOUNT'),
        OCM_REGION: need('REGION'),
        OCM_COUNTRY: need('COUNTRY'),
        OCM_KEY_NAMESPACE: need('KEY_NAMESPACE'),
        OCM_KEY_GROUP: process.env.KEY_GROUP || '',
        OCM_KEY: need('KEY')
    };
    const offerReq = (link) => ({ req: { headers: { authorization: 'Bearer ' + ADMIN } }, payload: { offer: link } });

    console.log('== 1. accept the participant credential into the tenant wallet');
    const acc = await run('facis-dsp-iam-receive.json', 'dsp-iam-recv-start', offerReq(need('OFFER')), env);
    check(acc && acc.statusCode === 201, 'offer accepted and stored (201)', acc && acc.statusCode + ' ' + reason(acc));

    console.log('== 2. an offer from an issuer the connector does not trust');
    const untrustedEnv = Object.assign({}, env, { DSP_TRUSTED_ISSUERS: 'did:web:another-issuer.invalid' });
    const ref = await run('facis-dsp-iam-receive.json', 'dsp-iam-recv-start', offerReq(need('OFFER_UNTRUSTED')), untrustedEnv);
    check(ref && ref.statusCode === 403 && ref.payload.deleted === true, 'refused (403) and the offer deleted', ref && ref.statusCode + ' ' + reason(ref));

    console.log('== 3. present it to a counterparty');
    const out = await run('facis-dsp-iam-issue.json', 'dsp-iam-issue-prep', { payload: { counterparty: AUD }, req: { headers: {} } }, env);
    const token = out && out.vpToken;
    check(typeof token === 'string' && token.includes('~'), 'presentation from the tenant storage, key binding by the crypto provider', reason(out));
    if (!token) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }

    console.log('== 4. the counterparty verifies it');
    const bearer = (t) => ({ req: { headers: { authorization: 'Bearer ' + t } }, payload: {} });
    const v = await run('facis-dsp-iam-verify.json', 'dsp-iam-prep', bearer(token), env);
    check(v && v.iamRejected === false && v.identity && v.identity.did === TENANT_DID,
        'accepted, identity ' + TENANT_DID + ' with roles ' + JSON.stringify(v && v.identity && v.identity.roles), reason(v));

    console.log('== 5. refusals');
    const again = await run('facis-dsp-iam-verify.json', 'dsp-iam-prep', bearer(token), env);
    check(again && again.payload && again.payload['dspace:code'] === 'replay_detected', 'the same presentation again: replay_detected', reason(again));
    const parts = token.split('~');
    const kb = parts.pop();
    const [h, p] = kb.split('.');
    const pl = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    pl.nonce = crypto.randomUUID();
    const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const input = h + '.' + Buffer.from(JSON.stringify(pl)).toString('base64url');
    const forged = parts.join('~') + '~' + input + '.' + crypto.sign('sha256', Buffer.from(input), { key: other.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const f = await run('facis-dsp-iam-verify.json', 'dsp-iam-prep', bearer(forged), env);
    check(f && f.payload && f.payload['dspace:code'] === 'holder_binding_failed', 'key binding signed by another key: holder_binding_failed', reason(f));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
