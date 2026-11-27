// GET /guard/login/status?attempt=... — polled by the login page. Answers
// from the attempt when it has ended; otherwise asks the verifier for the
// presentation it stored for this attempt's request.
// Outputs: 1 = verifier record fetch, 2 = JSON answer.
const cfg = global.get('guardConfig');
const answer = (code, body) => {
    msg.statusCode = code;
    msg.headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    delete msg.cookies;
    msg.payload = body;
    return [null, msg];
};
if (!cfg || !cfg.ok) return answer(503, { state: 'error' });

const id = String((msg.req.query || {}).attempt || '');
if (!/^[0-9a-f]{64}$/.test(id)) return answer(400, { state: 'unknown' });
const attempts = flow.get('guardAttempts') || {};
const a = attempts[id];
if (!a) return answer(404, { state: 'unknown' });

if (a.status === 'done') return answer(200, { state: 'done', redirect_to: a.redirectTo });
if (a.status === 'refused') return answer(200, { state: 'refused', message: a.message });
if (a.status === 'error') return answer(200, { state: 'error' });
if (Date.now() > a.expires) {
    a.status = 'expired';
    flow.set('guardAttempts', attempts);
    return answer(200, { state: 'expired' });
}
if (a.status === 'expired') return answer(200, { state: 'expired' });
// one evaluation at a time per attempt: a concurrent poll just waits
if (a.busy) return answer(200, { state: 'pending' });
a.busy = true;
flow.set('guardAttempts', attempts);

msg._guard = { attemptId: id };
const v = cfg.verifier;
msg.method = 'GET';
msg.url = v.base + v.recordPath.replace('{state}', encodeURIComponent(a.state));
msg.headers = { accept: 'application/json', 'x-tenantId': v.tenant, 'x-groupid': v.group };
msg.payload = '';
return [msg, null];
