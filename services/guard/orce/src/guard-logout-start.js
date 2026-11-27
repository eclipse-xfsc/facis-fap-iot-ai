// GET /guard/logout?logout_challenge=... — ends the guard session: the
// logout request is accepted without a page. Tokens already issued expire on
// their own (5 minutes).
// Outputs: 1 = accept logout request, 2 = error page.
const cfg = global.get('guardConfig');
const fail = (code, title, text) => {
    msg._guardError = { code, title, text };
    return [null, msg];
};
if (!cfg || !cfg.ok) return fail(503, 'Logout unavailable', 'The login service is not configured. Contact the platform administrator.');
const challenge = String((msg.req.query || {}).logout_challenge || '');
if (!/^[A-Za-z0-9._~=-]{1,4096}$/.test(challenge)) return fail(400, 'Invalid request', 'Log out again from the application.');
msg.method = 'PUT';
msg.url = cfg.hydraAdmin + '/admin/oauth2/auth/requests/logout/accept?logout_challenge=' + encodeURIComponent(challenge);
msg.headers = { accept: 'application/json' };
msg.payload = '';
return [msg, null];
