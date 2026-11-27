// Request object fetched: records the login attempt (single use, expires
// after GUARD_ATTEMPT_TTL_SECONDS) and serves the login page. The page shows
// the request as a QR code (mobile wallet), as a link (wallet on the same
// device) and as one button per configured web wallet (redirect), then polls
// /guard/login/status until the attempt ends.
// libs: crypto, qrcode. Outputs: 1 = login page, 2 = error page.
const cfg = global.get('guardConfig');
const g = msg._guard || {};
const fail = (code, title, text) => {
    msg._guardError = { code, title, text };
    node.send([null, msg]);
};

let ro = null;
try {
    const parts = String(msg.payload || '').trim().split('.');
    if (msg.statusCode === 200 && parts.length === 3) {
        ro = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    }
} catch (e) {
    ro = null;
}
const dcql = ro && ro.dcql_query && Array.isArray(ro.dcql_query.credentials) ? ro.dcql_query.credentials : [];
const dcqlIds = dcql.map((q) => (q && typeof q.id === 'string' ? q.id : null)).filter(Boolean);
if (!ro || typeof ro.nonce !== 'string' || !ro.nonce || typeof ro.client_id !== 'string' || !ro.client_id || dcqlIds.length === 0) {
    node.log(JSON.stringify({ event: 'guard.verifier.error', step: 'request-object', http: msg.statusCode }));
    fail(502, 'Login unavailable', 'The credential verifier returned an unusable request. Try again later.');
    return null;
}

const now = Date.now();
const attempts = flow.get('guardAttempts') || {};
for (const [k, a] of Object.entries(attempts)) {
    // drop expired attempts, and supersede the earlier attempts of the same
    // login request (renewing the attempt replaces it)
    if (a.expires + 60000 < now || (a.challenge === g.challenge && a.status === 'pending')) delete attempts[k];
}
const id = crypto.randomBytes(32).toString('hex');
attempts[id] = {
    challenge: g.challenge,
    appClient: g.appClient,
    addr: g.addr,
    state: g.state,
    requestId: g.requestId,
    nonce: ro.nonce,
    verifierClientId: ro.client_id,
    dcqlIds,
    created: now,
    expires: now + cfg.attemptTtl * 1000,
    status: 'pending',
    busy: false
};
flow.set('guardAttempts', attempts);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const requestUri = g.requestUri || (() => {
    try { return new url.URL(g.link.replace(/^openid4vp:\/\//, 'https://x/')).searchParams.get('request_uri') || ''; } catch (e) { return ''; }
})();
const wallets = cfg.webWallets.map((w) => ({
    name: w.name,
    href: w.url
        .split('{openid4vp}').join(encodeURIComponent(g.link))
        .split('{request_uri}').join(encodeURIComponent(requestUri))
        .split('{client_id}').join(encodeURIComponent(ro.client_id))
}));
const scriptNonce = crypto.randomBytes(16).toString('base64');

(async () => {
    let qr = '';
    try {
        qr = await qrcode.toString(g.link, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    } catch (e) {
        qr = '';
    }
    const brand = global.get('guardBrand') || { logo: '', css: '' };
    const walletButtons = wallets.length
        ? '<h2>Use a web wallet</h2><div class="actions">' +
          wallets.map((w) => '<a class="button" href="' + esc(w.href) + '">Open ' + esc(w.name) + '</a>').join('') + '</div>'
        : '';
    msg.statusCode = 200;
    msg.headers = {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; " +
            "script-src 'nonce-" + scriptNonce + "'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"
    };
    delete msg.cookies;
    msg.payload = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Log in with your wallet · FACIS</title>' +
        '<style>' + brand.css + '</style></head><body><main class="card">' +
        (brand.logo ? '<img class="logo" src="' + brand.logo + '" alt="FACIS">' : '') +
        '<h1>Log in with your wallet</h1>' +
        '<p>Present your role credential to log in. The request expires in ' + Math.round(cfg.attemptTtl / 60) + ' minutes and can be used once.</p>' +
        '<h2>Scan with a mobile wallet</h2>' +
        (qr ? '<div class="qr" aria-label="QR code of the presentation request">' + qr + '</div>' : '') +
        '<div class="actions"><a class="button" href="' + esc(g.link) + '">Open a wallet on this device</a></div>' +
        walletButtons +
        '<div id="status" class="status" role="status"><span class="spinner" aria-hidden="true"></span><span id="state">Waiting for your wallet…</span></div>' +
        '<div class="actions"><a id="renew" class="button secondary" href="" hidden>Start again</a></div>' +
        '</main><script nonce="' + scriptNonce + '">(function(){var id="' + id + '";var s=document.getElementById("state");' +
        'var box=document.getElementById("status");var r=document.getElementById("renew");r.href=location.href;' +
        'function show(t,renew,refused){s.textContent=t;r.hidden=!renew;box.className="status ended"+(refused?" refused":"");}' +
        'function poll(){fetch("login/status?attempt="+id,{cache:"no-store"}).then(function(x){return x.json();}).then(function(d){' +
        'if(d.state==="done"&&d.redirect_to){s.textContent="Logged in, redirecting…";location.assign(d.redirect_to);return;}' +
        'if(d.state==="refused"){show(d.message||"The login was refused.",true,true);return;}' +
        'if(d.state==="expired"||d.state==="unknown"){show("This request has expired.",true,false);return;}' +
        'if(d.state==="error"){show("The login could not be completed. Try again later.",true,true);return;}' +
        'setTimeout(poll,2000);}).catch(function(){setTimeout(poll,4000);});}setTimeout(poll,2000);})();</script>' +
        '</body></html>';
    node.log(JSON.stringify({ event: 'guard.login.started', client_id: g.appClient }));
    node.send([msg, null]);
})();
return null;
