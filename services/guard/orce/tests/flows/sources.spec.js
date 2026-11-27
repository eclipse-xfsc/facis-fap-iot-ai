// The flow JSON is built from src/ (build-flow.py): every function node's code
// must be its source file, so a change made in the JSON alone, or in src/
// without a rebuild, fails here.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ORCE = path.join(__dirname, '..', '..');
const flow = JSON.parse(fs.readFileSync(path.join(ORCE, 'flows', 'facis-guard-login.json'), 'utf8'));
const logo = 'data:image/svg+xml;base64,' +
    fs.readFileSync(path.join(ORCE, '..', '..', 'ai-insight-ui', 'ui', 'app', 'public', 'facis-logo.svg')).toString('base64');

test('sources: every function node is built from src/<id>.js', () => {
    const fns = flow.filter((n) => n.type === 'function');
    assert.ok(fns.length > 0);
    for (const n of fns) {
        const file = path.join(ORCE, 'src', n.id + '.js');
        assert.ok(fs.existsSync(file), 'no source for ' + n.id);
        const src = fs.readFileSync(file, 'utf8').replace('__FACIS_LOGO_DATA_URI__', logo);
        assert.strictEqual(n.func, src, n.id + ': the flow differs from src/' + n.id + '.js (run build-flow.py)');
    }
    const ids = new Set(fns.map((n) => n.id + '.js'));
    const orphans = fs.readdirSync(path.join(ORCE, 'src')).filter((f) => !ids.has(f));
    assert.deepStrictEqual(orphans, [], 'sources no node uses');
});

test('sources: the chart ships the same flow', () => {
    const copy = path.join(ORCE, '..', 'helm', 'facis-guard', 'files', 'orce-flows', 'facis-guard-login.json');
    assert.strictEqual(fs.readFileSync(copy, 'utf8'), fs.readFileSync(path.join(ORCE, 'flows', 'facis-guard-login.json'), 'utf8'));
});
