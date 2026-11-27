// Reply of the authorization server to an accept or reject call:
// {redirect_to}. Sends the browser there.
// Outputs: 1 = redirect, 2 = error page.
const p = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
if (msg.statusCode !== 200 || typeof p.redirect_to !== 'string' || !/^https?:\/\//.test(p.redirect_to)) {
    msg._guardError = { code: 502, title: 'Login unavailable', text: 'The authorization server did not answer. Try again later.' };
    return [null, msg];
}
msg.statusCode = 302;
msg.headers = { location: p.redirect_to, 'cache-control': 'no-store' };
delete msg.cookies;
msg.payload = '';
return [msg, null];
