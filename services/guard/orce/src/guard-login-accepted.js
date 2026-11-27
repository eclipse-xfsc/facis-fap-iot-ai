// Reply of the authorization server to the login accept: {redirect_to}. The
// attempt ends; the login page follows redirect_to, and the authorization
// server continues with the consent step. A successful login clears the
// failure counts of its address and holder (a lockout in force stays).
// Outputs: 1 = JSON answer.
const g = msg._guard || {};
const attempts = flow.get('guardAttempts') || {};
const a = attempts[g.attemptId];
msg.headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
delete msg.cookies;
const p = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
if (!a) {
    msg.statusCode = 404;
    msg.payload = { state: 'unknown' };
    return msg;
}
a.busy = false;
if (msg.statusCode === 200 && typeof p.redirect_to === 'string' && /^https?:\/\//.test(p.redirect_to)) {
    a.status = 'done';
    a.redirectTo = p.redirect_to;
    flow.set('guardAttempts', attempts);
    const locks = flow.get('guardLockouts') || {};
    for (const k of [a.addr ? 'addr:' + a.addr : null, g.holder ? 'holder:' + g.holder : null]) {
        if (k && locks[k] && !(locks[k].until > Date.now())) delete locks[k];
    }
    flow.set('guardLockouts', locks);
    node.log(JSON.stringify({ event: 'guard.login.accepted', client_id: a.appClient, org_did: g.credential && g.credential.org_did }));
    msg.statusCode = 200;
    msg.payload = { state: 'done', redirect_to: a.redirectTo };
    return msg;
}
a.status = 'error';
flow.set('guardAttempts', attempts);
node.log(JSON.stringify({ event: 'guard.login.error', step: 'accept', http: msg.statusCode }));
msg.statusCode = 200;
msg.payload = { state: 'error' };
return msg;
