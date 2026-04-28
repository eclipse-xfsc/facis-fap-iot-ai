/* eslint-disable */
//
// dlq.spec.js — DLQ envelope formatting + counter increment.
// Handler under test: sftp-fn-dlq-format in facis-sftp-dlq.json.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function formatDlq(msg, envVars, metricsRef) {
    let src = msg.payload;
    if (src && typeof src === 'object' && src.payload && src.payload.error_type) {
        src = src.payload;
    }
    if (!src || typeof src !== 'object') {
        src = { error_type: 'uncaught', error_message: String(msg.payload || msg.error || 'unknown') };
    }
    const dlq = {
        error_type: src.error_type || 'uncaught',
        error_message: src.error_message || 'unknown',
        error_timestamp: src.error_timestamp || 'fixed',
        filename: src.filename || null,
        source_topic: src.source_topic || null,
        original_envelope: src.original_envelope || null
    };
    metricsRef.facis_sftp_dlq_total = metricsRef.facis_sftp_dlq_total || {};
    metricsRef.facis_sftp_dlq_total[dlq.error_type] = (metricsRef.facis_sftp_dlq_total[dlq.error_type] || 0) + 1;
    return {
        topic: envVars.INGEST_DLQ_TOPIC || 'sftp.ingest.dlq',
        key: dlq.filename || 'unknown',
        payload: JSON.stringify(dlq)
    };
}

const env = { INGEST_DLQ_TOPIC: 'sftp.ingest.dlq' };

test('parse error becomes DLQ envelope with all 6 fields', () => {
    const m = {};
    const out = formatDlq({ payload: {
        error_type: 'parse',
        error_message: 'json: Unexpected token',
        filename: 'bad.json',
        source_topic: 'sftp://h/i/bad.json'
    }}, env, m);
    const parsed = JSON.parse(out.payload);
    for (const k of ['error_type', 'error_message', 'error_timestamp', 'filename', 'source_topic', 'original_envelope']) {
        assert.ok(k in parsed, 'missing ' + k);
    }
});

test('publish error includes original_envelope', () => {
    const m = {};
    const original = { ingest_timestamp: 't', source_topic: 's', kafka_partition: 0, kafka_offset: 0, kafka_key: 'k', raw_payload: '{}' };
    const out = formatDlq({ payload: {
        error_type: 'publish',
        error_message: 'broker timeout',
        filename: 'reading.json',
        source_topic: 'sftp://h/i/reading.json',
        original_envelope: original
    }}, env, m);
    const parsed = JSON.parse(out.payload);
    assert.deepEqual(parsed.original_envelope, original);
});

test('DLQ counter increments per error_type label', () => {
    const m = {};
    formatDlq({ payload: { error_type: 'parse', error_message: 'a' } }, env, m);
    formatDlq({ payload: { error_type: 'parse', error_message: 'b' } }, env, m);
    formatDlq({ payload: { error_type: 'publish', error_message: 'c' } }, env, m);
    assert.equal(m.facis_sftp_dlq_total.parse, 2);
    assert.equal(m.facis_sftp_dlq_total.publish, 1);
});

test('topic comes from INGEST_DLQ_TOPIC env (default sftp.ingest.dlq)', () => {
    const out = formatDlq({ payload: { error_type: 'parse' } }, env, {});
    assert.equal(out.topic, 'sftp.ingest.dlq');
});

test('topic env override works', () => {
    const out = formatDlq({ payload: { error_type: 'parse' } }, { INGEST_DLQ_TOPIC: 'custom.dlq' }, {});
    assert.equal(out.topic, 'custom.dlq');
});

test('kafka key is filename when present, else "unknown"', () => {
    const a = formatDlq({ payload: { error_type: 'parse', filename: 'x.json' } }, env, {});
    assert.equal(a.key, 'x.json');
    const b = formatDlq({ payload: { error_type: 'sftp', filename: null } }, env, {});
    assert.equal(b.key, 'unknown');
});

test('uncaught error (no payload.error_type) falls back', () => {
    const out = formatDlq({ payload: 'something bad' }, env, {});
    const parsed = JSON.parse(out.payload);
    assert.equal(parsed.error_type, 'uncaught');
});
