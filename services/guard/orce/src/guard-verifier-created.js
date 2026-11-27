// Reply of the verifier to the create call: {presentationId, requestId,
// authorizationUrl, requestUri, ttl} in both supported releases. Then fetches
// the request object, which carries the nonce, the verifier's client id and
// the DCQL query ids that the stored presentation is checked against.
// Outputs: 1 = request object fetch, 2 = error page.
const cfg = global.get('guardConfig');
const fail = (code, title, text) => {
    msg._guardError = { code, title, text };
    return [null, msg];
};
const p = msg.payload;
const str = (x) => typeof x === 'string' && x.length > 0 && x.length < 4096;
if ((msg.statusCode !== 201 && msg.statusCode !== 200) || !p || typeof p !== 'object' ||
    !str(p.presentationId) || !str(p.requestId) || !str(p.authorizationUrl) ||
    !p.authorizationUrl.startsWith('openid4vp://')) {
    node.log(JSON.stringify({ event: 'guard.verifier.error', step: 'create', http: msg.statusCode }));
    return fail(502, 'Login unavailable', 'The credential verifier could not create the request. Try again later.');
}

msg._guard.state = p.presentationId;
msg._guard.requestId = p.requestId;
msg._guard.link = p.authorizationUrl;
msg._guard.requestUri = str(p.requestUri) ? p.requestUri : '';

const v = cfg.verifier;
msg.method = 'GET';
msg.url = v.base + v.requestObjectPath.replace('{state}', encodeURIComponent(p.presentationId));
msg.headers = { accept: 'application/oauth-authz-req+jwt, application/jwt', 'x-tenantId': v.tenant, 'x-groupid': v.group };
msg.payload = '';
return [msg, null];
