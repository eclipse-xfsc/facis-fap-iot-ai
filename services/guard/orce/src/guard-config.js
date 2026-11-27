// Reads and checks the login provider's configuration once, at start, and
// publishes it as global "guardConfig" (plain data, no functions). Every
// other node fails closed while guardConfig.ok is false.
//
// The verifier client is described here, as data: the routes are the same in
// the supported verifier releases, only the body that creates a presentation
// request differs. Adding a release means adding one entry to PROFILES.
const errors = [];
const raw = (k) => String(env.get(k) || '').trim();
const required = (k) => {
    const v = raw(k);
    if (!v) errors.push(k + ' is required');
    return v;
};
const optional = (k, d) => raw(k) || d;
const integer = (k, d, min, max) => {
    const v = optional(k, String(d));
    const n = Number(v);
    if (!/^[0-9]+$/.test(v) || n < min || n > max) {
        errors.push(k + ' must be an integer between ' + min + ' and ' + max);
        return d;
    }
    return n;
};
const list = (k) => raw(k).split(',').map((s) => s.trim()).filter(Boolean);
const baseUrl = (k, v) => {
    if (!v) return '';
    try {
        const u = new url.URL(v);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
        return (u.origin + u.pathname).replace(/\/+$/, '');
    } catch (e) {
        errors.push(k + ' must be an http(s) URL');
        return '';
    }
};
const origin = (k, v) => {
    try {
        const u = new url.URL(v);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
        return u.origin;
    } catch (e) {
        errors.push(k + ': every entry must be an http(s) origin');
        return null;
    }
};

const attemptTtl = integer('GUARD_ATTEMPT_TTL_SECONDS', 300, 30, 900);

const PROFILES = {
    // Verifier 1.3.x: the client id comes from the tenant's verifier profile.
    'cvs-1.3': () => ({ permissionSet: required('GUARD_VERIFIER_PERMISSION_SET'), ttl: attemptTtl }),
    // Verifier 1.2.x: the request names a presentation policy and the client id.
    'cvs-1.2': () => ({
        presentationPolicyId: required('GUARD_VERIFIER_POLICY_ID'),
        clientId: required('GUARD_VERIFIER_CLIENT_ID'),
        ttl: attemptTtl
    })
};

const api = optional('GUARD_VERIFIER_API', 'cvs-1.3');
let createBody = null;
if (Object.prototype.hasOwnProperty.call(PROFILES, api)) {
    createBody = PROFILES[api]();
} else {
    errors.push('GUARD_VERIFIER_API must be one of ' + Object.keys(PROFILES).join(', '));
}

const tenant = required('GUARD_VERIFIER_TENANT');
if (tenant && !/^[A-Za-z0-9_-]{1,64}$/.test(tenant)) errors.push('GUARD_VERIFIER_TENANT has invalid characters');
const group = optional('GUARD_VERIFIER_GROUP', 'default');
if (!/^[A-Za-z0-9_-]{1,64}$/.test(group)) errors.push('GUARD_VERIFIER_GROUP has invalid characters');
const t = encodeURIComponent(tenant);

const webWallets = [];
if (raw('GUARD_WEB_WALLETS')) {
    let parsed = null;
    try { parsed = JSON.parse(raw('GUARD_WEB_WALLETS')); } catch (e) { parsed = null; }
    if (!Array.isArray(parsed)) {
        errors.push('GUARD_WEB_WALLETS must be a JSON array of {"name", "url"}');
    } else {
        for (const w of parsed) {
            const ok = w && typeof w.name === 'string' && w.name.trim() && typeof w.url === 'string' &&
                /^https:\/\//.test(w.url) && (w.url.includes('{request_uri}') || w.url.includes('{openid4vp}'));
            if (ok) webWallets.push({ name: w.name.trim().slice(0, 60), url: w.url });
            else errors.push('GUARD_WEB_WALLETS: each entry needs a name and an https url with {request_uri} or {openid4vp}');
        }
    }
}

const statusListOrigins = list('GUARD_STATUS_LIST_ORIGINS').map((o) => origin('GUARD_STATUS_LIST_ORIGINS', o)).filter(Boolean);
if (statusListOrigins.length === 0) errors.push('GUARD_STATUS_LIST_ORIGINS is required (the status list origins of the trusted issuers)');

const firstPartyClients = list('GUARD_FIRST_PARTY_CLIENTS');
if (firstPartyClients.length === 0) errors.push('GUARD_FIRST_PARTY_CLIENTS is required');

const cfg = {
    ok: false,
    errors,
    hydraAdmin: baseUrl('GUARD_HYDRA_ADMIN_URL', required('GUARD_HYDRA_ADMIN_URL')),
    policyUrl: baseUrl('GUARD_POLICY_URL', required('GUARD_POLICY_URL')),
    verifier: {
        api,
        base: baseUrl('GUARD_VERIFIER_URL', required('GUARD_VERIFIER_URL')),
        tenant,
        group,
        createBody,
        createPath: '/v1/tenants/' + t + '/internal/presentations/authorization',
        requestObjectPath: '/v1/tenants/' + t + '/presentation/proof/{state}/request-object/request.jwt',
        recordPath: '/v1/tenants/' + t + '/internal/presentations/{state}',
        pendingCodes: [404, 409],
        verifiedStatus: 'presentation-received',
        rejectedStatus: 'presentation-rejected'
    },
    firstPartyClients,
    statusListOrigins,
    webWallets,
    attemptTtl,
    lockout: {
        maxFailures: integer('GUARD_LOCKOUT_MAX_FAILURES', 5, 1, 100),
        windowSeconds: integer('GUARD_LOCKOUT_WINDOW_SECONDS', 900, 60, 86400),
        seconds: integer('GUARD_LOCKOUT_SECONDS', 900, 60, 86400)
    },
    proxyHops: integer('GUARD_TRUSTED_PROXY_HOPS', 1, 0, 5),
    // One media type only: some status list services answer a list of types with
    // an empty body. The W-Stack's own type is the default; another issuer may
    // answer its standard format, which is read too.
    statusListAccept: optional('GUARD_STATUS_LIST_ACCEPT', 'application/vnd.xfsc.status-list')
};
cfg.ok = errors.length === 0;

global.set('guardConfig', cfg);
if (cfg.ok) {
    node.status({ fill: 'green', shape: 'dot', text: 'verifier ' + api });
} else {
    node.status({ fill: 'red', shape: 'ring', text: errors.length + ' configuration error(s)' });
    node.error('guard configuration invalid, logins are refused: ' + errors.join('; '));
}
return msg;   // no outputs: nothing is sent, the node just ends
