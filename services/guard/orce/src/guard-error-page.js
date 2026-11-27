// Renders msg._guardError {code, title, text} as a plain page, with no
// internal detail.
// Outputs: 1 = page.
const e = msg._guardError || { code: 500, title: 'Login unavailable', text: 'Try again later.' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
msg.statusCode = Number.isInteger(e.code) ? e.code : 500;
msg.headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
};
delete msg.cookies;
const brand = global.get('guardBrand') || { logo: '', css: '' };
msg.payload = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(e.title) + ' · FACIS</title>' +
    '<style>' + brand.css + '</style></head><body><main class="card">' +
    (brand.logo ? '<img class="logo" src="' + brand.logo + '" alt="FACIS">' : '') +
    '<h1>' + esc(e.title) + '</h1><p>' + esc(e.text) + '</p></main></body></html>';
return msg;
