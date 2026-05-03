/* eslint-disable */
//
// kafka-access.spec.js — Kafka-streaming access object parity with
// transfer_store._provision_kafka_streaming() (transfer_store.py:165-182).
//
// Pinned-input asserts:
//   - topic format `iot.dataset.{assetId}.tp-{transferId}` — preserves the
//     doubled `tp-tp-` prefix that Python emits literally
//   - SCRAM-SHA-256 mechanism
//   - username `user_{transferId}`
//   - password is base64url, 32 chars (== secrets.token_urlsafe(24))
//

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function isoUtcWithOffset(d) {
    return d.toISOString().slice(0, -1) + '000+00:00';
}

function provisionKafka(transfer, opts) {
    const bootstrap = opts.bootstrap || 'kafka.provider.example:9092';
    const ttl = opts.ttl || 3600;
    const now = opts.now || new Date();
    const password = crypto.randomBytes(24).toString('base64url');
    return {
        bootstrap,
        topic: 'iot.dataset.' + transfer.assetId + '.tp-' + transfer.id,
        sasl: { mechanism: 'SCRAM-SHA-256', username: 'user_' + transfer.id, password },
        expiresAt: isoUtcWithOffset(new Date(now.getTime() + ttl * 1000)),
    };
}

test('topic includes the literal doubled tp- prefix (Python parity)', () => {
    const out = provisionKafka(
        { id: 'tp-abc123def456', assetId: 'dataset:facis:net-grid-hourly' },
        { now: new Date() }
    );
    // Python: f"iot.dataset.{assetId}.tp-{transfer.id}" with transfer.id='tp-...'
    // → 'iot.dataset.dataset:facis:net-grid-hourly.tp-tp-abc123def456'
    assert.equal(out.topic, 'iot.dataset.dataset:facis:net-grid-hourly.tp-tp-abc123def456');
});

test('SASL mechanism is SCRAM-SHA-256', () => {
    const out = provisionKafka(
        { id: 'tp-x', assetId: 'a' },
        { now: new Date() }
    );
    assert.equal(out.sasl.mechanism, 'SCRAM-SHA-256');
});

test('username is `user_{transferId}` (transferId already starts with tp-)', () => {
    const out = provisionKafka(
        { id: 'tp-deadbeef0001', assetId: 'a' },
        { now: new Date() }
    );
    assert.equal(out.sasl.username, 'user_tp-deadbeef0001');
});

test('password is 32-char base64url (matches secrets.token_urlsafe(24))', () => {
    const out = provisionKafka({ id: 'tp-x', assetId: 'a' }, { now: new Date() });
    assert.equal(out.sasl.password.length, 32);
    assert.match(out.sasl.password, /^[A-Za-z0-9_-]+$/);
    assert.ok(!out.sasl.password.includes('='), 'must not have padding');
});

test('successive provisions produce distinct passwords', () => {
    const a = provisionKafka({ id: 'tp-1', assetId: 'a' }, { now: new Date() });
    const b = provisionKafka({ id: 'tp-1', assetId: 'a' }, { now: new Date() });
    assert.notEqual(a.sasl.password, b.sasl.password);
});

test('bootstrap defaults to kafka.provider.example:9092 when env unset', () => {
    const out = provisionKafka({ id: 'tp-x', assetId: 'a' }, { now: new Date() });
    assert.equal(out.bootstrap, 'kafka.provider.example:9092');
});

test('expiresAt format: µs + +00:00 (matches Python isoformat())', () => {
    const fixed = new Date(Date.parse('2026-04-07T00:00:00.000Z'));
    const out = provisionKafka({ id: 'tp-x', assetId: 'a' }, { now: fixed, ttl: 3600 });
    // expected: 2026-04-07T01:00:00.000000+00:00
    assert.equal(out.expiresAt, '2026-04-07T01:00:00.000000+00:00');
});
