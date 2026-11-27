// Reply of the authorization server to GET .../requests/login. Only the
// first-party web applications may use the wallet login. Then asks the
// verifier to create a presentation request (body per verifier release, see
// guard-config).
// Outputs: 1 = verifier request, 2 = error page.
const cfg = global.get('guardConfig');
const fail = (code, title, text) => {
    msg._guardError = { code, title, text };
    return [null, msg];
};
if (!cfg || !cfg.ok) {
    return fail(503, 'Login unavailable', 'The login service is not configured. Contact the platform administrator.');
}
const lr = msg.payload;
if (msg.statusCode !== 200 || !lr || typeof lr !== 'object') {
    // 404/410: unknown or expired challenge; anything else: admin API down
    const expired = msg.statusCode === 404 || msg.statusCode === 410;
    return fail(expired ? 410 : 502, expired ? 'Login request expired' : 'Login unavailable',
        expired ? 'Start the login again from the application.' : 'The authorization server did not answer. Try again later.');
}
const clientId = lr.client && typeof lr.client.client_id === 'string' ? lr.client.client_id : '';
if (!cfg.firstPartyClients.includes(clientId)) {
    node.log(JSON.stringify({ event: 'guard.login.refused', reason: 'client not allowed', client_id: clientId }));
    return fail(403, 'Application not allowed', 'This application may not use the wallet login.');
}

msg._guard.appClient = clientId;
const v = cfg.verifier;
msg.method = 'POST';
msg.url = v.base + v.createPath;
msg.headers = { 'content-type': 'application/json', accept: 'application/json', 'x-tenantId': v.tenant, 'x-groupid': v.group };
msg.payload = JSON.stringify(v.createBody);
return [msg, null];
