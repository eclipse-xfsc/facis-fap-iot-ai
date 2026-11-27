// Decision of the policy engine (facis.login). On allow, accepts the login at
// the authorization server: the subject is the holder DID, the verified
// claims travel in the login context to the consent step, which puts them
// into the tokens. Nothing is remembered: every login presents again.
// Outputs: 1 = accept login request, 2 = refusal.
const cfg = global.get('guardConfig');
const g = msg._guard || {};
const attempts = flow.get('guardAttempts') || {};
const a = attempts[g.attemptId];
const refuse = (reason, counts) => {
    g.refusal = { reason, countsAsFailure: counts !== false };
    return [null, msg];
};
if (!cfg || !cfg.ok || !a) return refuse('configuration or attempt missing', false);

let body = msg.payload;
if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
if (msg.statusCode !== 200 || !body || typeof body !== 'object' || !('result' in body)) {
    node.log(JSON.stringify({ event: 'guard.policy.error', http: msg.statusCode }));
    return refuse('policy engine unavailable', false);
}
// facis.login returns {allow, reason}; a plain boolean is accepted too
const d = body.result;
const allow = d === true || (d && typeof d === 'object' && d.allow === true);
if (!allow) return refuse('login policy: ' + (d && typeof d.reason === 'string' ? d.reason : 'denied'));

const c = g.credential;
const claims = { org_did: c.org_did, roles: c.roles, purpose: c.purpose };
const display = {};
if (c.name) display.name = c.name;
if (c.email) display.email = c.email;

msg.method = 'PUT';
msg.url = cfg.hydraAdmin + '/admin/oauth2/auth/requests/login/accept?login_challenge=' + encodeURIComponent(a.challenge);
msg.headers = { 'content-type': 'application/json', accept: 'application/json' };
msg.payload = JSON.stringify({
    subject: g.holder,
    remember: false,
    amr: ['vp'],
    context: { claims, display, issuer: c.issuer }
});
return [msg, null];
