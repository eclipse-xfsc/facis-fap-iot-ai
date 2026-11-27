// Consent request received. The web applications are first-party clients:
// consent is given without a page, the login policy was the gate. The claims
// verified at login (login context) go into the tokens: org_did, roles and
// purpose into the access token and the ID token, name and email into the ID
// token only. Any other client is refused.
// Outputs: 1 = accept (or reject) consent request, 2 = error page.
const cfg = global.get('guardConfig');
const fail = (code, title, text) => {
    msg._guardError = { code, title, text };
    return [null, msg];
};
if (!cfg || !cfg.ok) return fail(503, 'Login unavailable', 'The login service is not configured. Contact the platform administrator.');
const cr = msg.payload;
if (msg.statusCode !== 200 || !cr || typeof cr !== 'object') {
    const expired = msg.statusCode === 404 || msg.statusCode === 410;
    return fail(expired ? 410 : 502, expired ? 'Login request expired' : 'Login unavailable',
        expired ? 'Start the login again from the application.' : 'The authorization server did not answer. Try again later.');
}
const challenge = msg._guard.consentChallenge;
const clientId = cr.client && typeof cr.client.client_id === 'string' ? cr.client.client_id : '';
const ctx = cr.context && typeof cr.context === 'object' ? cr.context : {};
const claims = ctx.claims && typeof ctx.claims === 'object' ? ctx.claims : null;

msg.method = 'PUT';
msg.headers = { 'content-type': 'application/json', accept: 'application/json' };
if (!cfg.firstPartyClients.includes(clientId) || !claims) {
    node.log(JSON.stringify({ event: 'guard.consent.rejected', client_id: clientId, reason: claims ? 'client not first-party' : 'no verified claims' }));
    msg.url = cfg.hydraAdmin + '/admin/oauth2/auth/requests/consent/reject?consent_challenge=' + encodeURIComponent(challenge);
    msg.payload = JSON.stringify({ error: 'access_denied', error_description: 'The wallet login is limited to the platform applications.' });
    return [msg, null];
}
const tokenClaims = { org_did: claims.org_did, roles: claims.roles, purpose: claims.purpose };
msg.url = cfg.hydraAdmin + '/admin/oauth2/auth/requests/consent/accept?consent_challenge=' + encodeURIComponent(challenge);
msg.payload = JSON.stringify({
    grant_scope: Array.isArray(cr.requested_scope) ? cr.requested_scope : [],
    grant_access_token_audience: Array.isArray(cr.requested_access_token_audience) ? cr.requested_access_token_audience : [],
    remember: false,
    session: {
        access_token: tokenClaims,
        id_token: Object.assign({}, tokenClaims, ctx.display && typeof ctx.display === 'object' ? ctx.display : {})
    }
});
return [msg, null];
