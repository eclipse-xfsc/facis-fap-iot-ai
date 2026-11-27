// GET /guard/consent?consent_challenge=... — asks the authorization server
// for the consent request.
// Outputs: 1 = admin API request, 2 = error page.
const cfg = global.get('guardConfig');
const fail = (code, title, text) => {
    msg._guardError = { code, title, text };
    return [null, msg];
};
if (!cfg || !cfg.ok) return fail(503, 'Login unavailable', 'The login service is not configured. Contact the platform administrator.');
const challenge = String((msg.req.query || {}).consent_challenge || '');
if (!/^[A-Za-z0-9._~=-]{1,4096}$/.test(challenge)) return fail(400, 'Invalid request', 'Start the login again from the application.');
msg._guard = { consentChallenge: challenge };
msg.method = 'GET';
msg.url = cfg.hydraAdmin + '/admin/oauth2/auth/requests/consent?consent_challenge=' + encodeURIComponent(challenge);
msg.headers = { accept: 'application/json' };
msg.payload = '';
return [msg, null];
