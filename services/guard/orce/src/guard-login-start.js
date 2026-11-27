// GET /guard/login?login_challenge=... — the authorization server sends the
// browser here. Checks the challenge, the configuration and the lockout of
// the client address, then asks the authorization server's admin API for the
// login request.
// Outputs: 1 = admin API request, 2 = error page.
const cfg = global.get('guardConfig');
const fail = (code, title, text) => {
    msg._guardError = { code, title, text };
    return [null, msg];
};
if (!cfg || !cfg.ok) {
    return fail(503, 'Login unavailable', 'The login service is not configured. Contact the platform administrator.');
}

// Hydra's challenges carry the flow state (about 1 100 characters, base64url):
// the check is on the alphabet and an upper bound, not a fixed length.
const challenge = String((msg.req.query || {}).login_challenge || '');
if (!/^[A-Za-z0-9._~=-]{1,4096}$/.test(challenge)) {
    return fail(400, 'Invalid login request', 'Start the login again from the application.');
}

// Client address: with N trusted proxies (the ingress), the client is the
// N-th entry from the right of X-Forwarded-For; entries further left are
// set by the client and are not trusted.
const xff = String((msg.req.headers || {})['x-forwarded-for'] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
const addr = (cfg.proxyHops > 0 && xff.length >= cfg.proxyHops)
    ? xff[xff.length - cfg.proxyHops]
    : (msg.req.ip || 'unknown');

const now = Date.now();
const locks = flow.get('guardLockouts') || {};
const lock = locks['addr:' + addr];
if (lock && lock.until > now) {
    node.log(JSON.stringify({ event: 'guard.login.locked', key: 'addr', until: new Date(lock.until).toISOString() }));
    return fail(429, 'Too many failed attempts', 'Logins from this address are paused for a while. Try again later or contact the platform administrator.');
}

msg._guard = { challenge, addr };
msg.method = 'GET';
msg.url = cfg.hydraAdmin + '/admin/oauth2/auth/requests/login?login_challenge=' + encodeURIComponent(challenge);
msg.headers = { accept: 'application/json' };
msg.payload = '';
return [msg, null];
