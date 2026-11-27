// GET /guard/error?error=...&error_description=... — where the authorization
// server sends the browser when it cannot complete a login. Shows its error
// code and description (escaped, shortened) on the plain error page.
// Outputs: 1 = error page.
const q = msg.req.query || {};
const clip = (v, n) => String(v || '').replace(/[\r\n\t]+/g, ' ').slice(0, n);
const code = clip(q.error, 64) || 'unknown_error';
const desc = clip(q.error_description, 300);
msg._guardError = {
    code: 400,
    title: 'Login failed',
    text: (desc ? desc + ' ' : '') + '(' + code + '). Start the login again from the application.'
};
return msg;
