// The look of the login provider's pages, published once at start as global
// "guardBrand" {logo, css}: the FACIS logo (embedded, the pages fetch nothing
// from elsewhere) and the stylesheet, after the AI Insight UI's design tokens
// (canvas, white card, primary #005FFF, 8 px controls, its call-to-action
// buttons and its loading spinner). Both pages use it: guard-attempt-create
// (login) and guard-error-page.
const logo = '__FACIS_LOGO_DATA_URI__';
const css = [
    ':root{--canvas:#E1E7EF;--surface:#FFFFFF;--primary:#005FFF;--primary-hover:#2563EB;--primary-soft:#ECF4FF;',
    '--text:#1F2937;--muted:#6B7280;--border:#E5E7EB;--danger-dark:#991B1B;--radius-card:20px;--radius-control:8px;',
    '--shadow:0 1px 4px rgba(0,0,0,.10);',
    "--font:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','Helvetica Neue',Arial,sans-serif}",
    '*{box-sizing:border-box}',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;',
    'background:var(--canvas);color:var(--text);font-family:var(--font)}',
    '.card{width:100%;max-width:420px;background:var(--surface);border-radius:var(--radius-card);box-shadow:var(--shadow);',
    'padding:32px 28px;text-align:center}',
    '.logo{width:120px;height:auto;margin:0 auto 20px;display:block}',
    'h1{font-size:20px;font-weight:600;margin:0 0 8px}',
    'h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:24px 0 10px}',
    'p{font-size:14px;line-height:1.5;color:var(--muted);margin:0 0 8px}',
    '.qr{display:inline-block;padding:12px;border:1px solid var(--border);border-radius:var(--radius-control);background:#fff}',
    '.qr svg{display:block;width:220px;height:220px}',
    '.actions{display:flex;flex-direction:column;gap:10px;margin-top:16px}',
    '.button{display:block;width:100%;padding:14px 32px;border:none;border-radius:var(--radius-control);',
    'background:var(--primary);color:var(--surface);font:600 14px var(--font);text-decoration:none;cursor:pointer;',
    'transition:background .15s}',
    '.button:hover,.button:focus-visible{background:var(--primary-hover)}',
    '.button.secondary{background:var(--surface);color:var(--primary);border:1px solid var(--primary)}',
    '.button.secondary:hover,.button.secondary:focus-visible{background:var(--primary-soft)}',
    '.status{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:24px;min-height:28px;font-size:14px;color:var(--muted)}',
    '.spinner{width:20px;height:20px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;',
    'animation:spin .8s linear infinite}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '.status.ended .spinner{display:none}',
    '.status.refused{color:var(--danger-dark)}',
    '[hidden]{display:none!important}'
].join('');
global.set('guardBrand', { logo: logo.startsWith('data:image/') ? logo : '', css });
return msg;   // no outputs: nothing is sent, the node just ends
