// Every refusal of a login attempt ends here. The attempt ends (single use).
// A refusal caused by the presentation counts as a failure for the client
// address and for the holder; after GUARD_LOCKOUT_MAX_FAILURES failures
// within GUARD_LOCKOUT_WINDOW_SECONDS, both are locked out for
// GUARD_LOCKOUT_SECONDS. Failures of the platform (verifier, status list or
// policy engine unavailable) do not count. The page gets a generic message;
// the reason goes to the audit log only.
// Outputs: 1 = JSON answer.
const cfg = global.get('guardConfig');
const g = msg._guard || {};
const r = g.refusal || { reason: 'refused', countsAsFailure: true };
const attempts = flow.get('guardAttempts') || {};
const a = attempts[g.attemptId];
const now = Date.now();
let locked = false;

if (a) {
    a.busy = false;
    a.status = 'refused';
    a.message = 'The login was refused. Check that you presented a valid role credential for this application.';
    flow.set('guardAttempts', attempts);
}
if (cfg && cfg.ok && r.countsAsFailure) {
    const locks = flow.get('guardLockouts') || {};
    const keys = [];
    if (a && a.addr) keys.push('addr:' + a.addr);
    if (g.holder) keys.push('holder:' + g.holder);
    for (const k of keys) {
        const l = locks[k] || { failures: [], until: 0 };
        l.failures = l.failures.filter((t) => t > now - cfg.lockout.windowSeconds * 1000);
        l.failures.push(now);
        if (l.failures.length >= cfg.lockout.maxFailures) {
            l.until = now + cfg.lockout.seconds * 1000;
            l.failures = [];
            locked = true;
            node.log(JSON.stringify({ event: 'guard.lockout.set', key: k.split(':')[0], until: new Date(l.until).toISOString() }));
        }
        locks[k] = l;
    }
    for (const [k, l] of Object.entries(locks)) {
        if (l.until < now && l.failures.every((t) => t <= now - cfg.lockout.windowSeconds * 1000)) delete locks[k];
    }
    flow.set('guardLockouts', locks);
}
node.log(JSON.stringify({ event: 'guard.login.refused', reason: r.reason, counted: r.countsAsFailure, client_id: a && a.appClient }));

msg.statusCode = 200;
msg.headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
delete msg.cookies;
msg.payload = { state: 'refused', message: locked ? 'Too many failed attempts. Logins are paused for a while.' : (a ? a.message : 'The login was refused.') };
return msg;
