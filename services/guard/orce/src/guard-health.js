// GET /guard/health — readiness of the login provider: 200 when the
// configuration is valid, 503 otherwise (the errors name variables, not
// values).
// Outputs: 1 = JSON answer.
const cfg = global.get('guardConfig');
msg.headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
delete msg.cookies;
if (cfg && cfg.ok) {
    msg.statusCode = 200;
    msg.payload = { status: 'ok', verifier: cfg.verifier.api };
} else {
    msg.statusCode = 503;
    msg.payload = { status: 'misconfigured', errors: cfg ? cfg.errors : ['configuration not loaded'] };
}
return msg;
