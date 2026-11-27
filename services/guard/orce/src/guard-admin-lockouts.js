// GET /guard/admin/lockouts lists the active lockouts; DELETE
// /guard/admin/lockouts?key=<addr:...|holder:...> lifts one. Bearer
// GUARD_ADMIN_TOKEN, compared in constant time; both actions are audited.
// Without a configured token the endpoints answer 503 (fail closed).
// Exposed inside the cluster only (not routed by the ingress).
// libs: crypto. Outputs: 1 = JSON answer.
const answer = (code, body) => {
    msg.statusCode = code;
    msg.headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    delete msg.cookies;
    msg.payload = body;
    return msg;
};
const token = String(env.get('GUARD_ADMIN_TOKEN') || '');
if (!token) return answer(503, { error: 'admin endpoints disabled: GUARD_ADMIN_TOKEN is not set' });
const h = String((msg.req.headers || {}).authorization || '');
const given = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
const a = crypto.createHash('sha256').update(given).digest();
const b = crypto.createHash('sha256').update(token).digest();
if (!given || !crypto.timingSafeEqual(a, b)) return answer(401, { error: 'admin token required' });

const now = Date.now();
const locks = flow.get('guardLockouts') || {};
if (msg.req.method === 'DELETE') {
    const key = String((msg.req.query || {}).key || '');
    if (!/^(addr|holder):.{1,512}$/.test(key)) return answer(400, { error: 'key must be addr:<address> or holder:<did>' });
    const existed = Object.prototype.hasOwnProperty.call(locks, key);
    delete locks[key];
    flow.set('guardLockouts', locks);
    node.log(JSON.stringify({ event: 'guard.lockout.lifted', key, existed }));
    return answer(200, { lifted: existed, key });
}
const active = Object.entries(locks)
    .filter(([, l]) => l.until > now)
    .map(([key, l]) => ({ key, until: new Date(l.until).toISOString() }));
node.log(JSON.stringify({ event: 'guard.lockout.listed', count: active.length }));
return answer(200, { lockouts: active });
