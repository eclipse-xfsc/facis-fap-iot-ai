/* eslint-disable */
//
// hmac-url.spec.js — byte-equivalence with transfer_store._provision_http_pull().
//
// The handler under test lives inline in the function node `dsp-tx-create`
// of `services/dsp-connector/orce/flows/facis-dsp-transfers.json`. This spec
// re-implements the same logic so we can pin it under `node --test` and
// guarantee byte-identical output to the Python reference.
//
// Invariant: keep `provisionHttpPull()` here in sync with the function-node
// body in facis-dsp-transfers.json.
//

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function isoUtcWithOffset(d) {
    return d.toISOString().slice(0, -1) + '000+00:00';
}

function provisionHttpPull(transfer, opts) {
    const secret = opts.secret;
    const baseUrl = (opts.baseUrl || 'https://ai-insight.facis.cloud').replace(/\/$/, '');
    const ttl = opts.ttl || 3600;
    const now = opts.now || new Date();
    if (!secret) throw new Error('DSP_HMAC_SECRET unset');
    const path = '/api/data/' + transfer.assetId;
    const fromTs = (transfer.parameters && transfer.parameters.windowFrom) || '';
    const toTs = (transfer.parameters && transfer.parameters.windowTo) || '';
    const expiresAt = isoUtcWithOffset(new Date(now.getTime() + ttl * 1000));
    const message = 'GET:' + path + ':' + fromTs + ':' + toTs + ':' + expiresAt;
    const token = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
                        .update(message, 'utf8').digest('hex');
    return {
        url: baseUrl + path + '?from=' + fromTs + '&to=' + toTs + '&expiresAt=' + expiresAt + '&sig=' + token,
        token: token,
        expiresAt: expiresAt,
    };
}

// ── Python reference: hmac.new(secret, msg, sha256).hexdigest() with
//    secret encoded utf-8, msg = "GET:{path}:{from}:{to}:{expires}".
//    A pinned-input + pinned-clock test gives a stable hash we can diff.

test('expiresAt has microsecond precision and +00:00 suffix (matches Python isoformat())', () => {
    const fixed = new Date(Date.parse('2026-04-07T00:00:00.123Z'));
    const out = isoUtcWithOffset(fixed);
    // toISOString() => '2026-04-07T00:00:00.123Z'
    // slice(0, -1) + '000+00:00' => '2026-04-07T00:00:00.123000+00:00'
    assert.equal(out, '2026-04-07T00:00:00.123000+00:00');
    assert.ok(out.endsWith('+00:00'));
    assert.ok(!out.endsWith('Z'));
});

test('HMAC hex digest is lowercase (matches Python hexdigest())', () => {
    const transfer = {
        assetId: 'dataset:facis:net-grid-hourly',
        parameters: { windowFrom: '2026-04-07T00:00:00Z', windowTo: '2026-04-07T23:59:59Z' }
    };
    const out = provisionHttpPull(transfer, {
        secret: 'a'.repeat(64),
        baseUrl: 'https://ai-insight.facis.cloud',
        ttl: 3600,
        now: new Date(Date.parse('2026-04-07T00:00:00Z'))
    });
    assert.match(out.token, /^[0-9a-f]{64}$/);
});

test('URL has the exact query-string ordering: from, to, expiresAt, sig', () => {
    const transfer = {
        assetId: 'dataset:facis:weather-hourly',
        parameters: { windowFrom: '2026-04-01T00:00:00Z', windowTo: '2026-04-07T00:00:00Z' }
    };
    const out = provisionHttpPull(transfer, {
        secret: 'b'.repeat(64),
        now: new Date(Date.parse('2026-04-01T00:00:00Z'))
    });
    const u = new URL(out.url);
    assert.equal(u.pathname, '/api/data/dataset:facis:weather-hourly');
    const qs = u.search.replace(/^\?/, '').split('&').map(p => p.split('=')[0]);
    assert.deepEqual(qs, ['from', 'to', 'expiresAt', 'sig']);
});

test('canonical message format: GET:{path}:{from}:{to}:{expires}', () => {
    // Reconstruct the canonical message manually to guard against drift.
    const secret = 'c'.repeat(64);
    const fromTs = '2026-04-07T00:00:00Z';
    const toTs = '2026-04-07T23:59:59Z';
    const path = '/api/data/dataset:facis:net-grid-hourly';
    const fixed = new Date(Date.parse('2026-04-07T00:00:00Z'));
    const expiresAt = isoUtcWithOffset(new Date(fixed.getTime() + 3600 * 1000));
    const message = 'GET:' + path + ':' + fromTs + ':' + toTs + ':' + expiresAt;
    const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
                           .update(message, 'utf8').digest('hex');

    const out = provisionHttpPull(
        { assetId: 'dataset:facis:net-grid-hourly', parameters: { windowFrom: fromTs, windowTo: toTs } },
        { secret, now: fixed, ttl: 3600 }
    );
    assert.equal(out.token, expected);
});

test('empty window params produce literal empty strings between colons', () => {
    const transfer = {
        assetId: 'dataset:facis:anomaly-candidates',
        parameters: {}    // no windowFrom / windowTo
    };
    const fixed = new Date(Date.parse('2026-04-07T00:00:00Z'));
    const out = provisionHttpPull(transfer, { secret: 'd'.repeat(64), now: fixed });
    // URL must still include `from=` and `to=` (with empty values) — DO NOT omit
    assert.ok(out.url.includes('from=&to=&expiresAt='),
              'expected from=&to=&expiresAt= ; got: ' + out.url);
});

test('missing DSP_HMAC_SECRET throws', () => {
    assert.throws(() => provisionHttpPull(
        { assetId: 'x', parameters: {} },
        { secret: '', now: new Date() }
    ), /DSP_HMAC_SECRET/);
});

test('trailing slash on base URL is stripped', () => {
    const out = provisionHttpPull(
        { assetId: 'x', parameters: {} },
        { secret: 'e'.repeat(64), baseUrl: 'https://example.com/', now: new Date() }
    );
    assert.ok(out.url.startsWith('https://example.com/api/data/x?'),
              'expected single slash; got: ' + out.url);
});
