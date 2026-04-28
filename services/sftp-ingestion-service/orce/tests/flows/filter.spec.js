/* eslint-disable */
//
// filter.spec.js — extension + size + S_ISREG guard.
// Handler under test: sftp-fn-validate-file in facis-sftp-filter.json.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function validateFile(msg, env) {
    const accepted = (env.INGEST_ACCEPTED_EXTENSIONS || '.json,.csv,.avro')
        .split(',').map(s => s.trim().toLowerCase());
    const maxSize = Number(env.INGEST_MAX_FILE_SIZE_BYTES || 104857600);
    const ext = (msg.ext || '').toLowerCase();
    const size = Number(msg.size_bytes || 0);
    const reasons = [];
    if (!accepted.includes(ext)) reasons.push('extension_not_accepted:' + ext);
    if (size > maxSize) reasons.push('size_exceeded:' + size);
    if (msg.is_regular === false) reasons.push('not_regular_file');
    if (reasons.length === 0) {
        return { ok: true, msg };
    }
    return { ok: false, dlq: {
        error_type: 'filter',
        error_message: reasons.join(','),
        filename: msg.filename,
        source_topic: msg.source_topic
    }};
}

const env = {};
const baseMsg = {
    filename: 'reading.json',
    ext: '.json',
    size_bytes: 1024,
    is_regular: true,
    source_topic: 'sftp://host/ingest/reading.json'
};

test('accepted .json file passes', () => {
    assert.equal(validateFile(baseMsg, env).ok, true);
});

test('accepted .csv file passes', () => {
    assert.equal(validateFile(Object.assign({}, baseMsg, { ext: '.csv', filename: 'd.csv' }), env).ok, true);
});

test('rejected .exe file → DLQ filter', () => {
    const r = validateFile(Object.assign({}, baseMsg, { ext: '.exe', filename: 'bad.exe' }), env);
    assert.equal(r.ok, false);
    assert.equal(r.dlq.error_type, 'filter');
    assert.match(r.dlq.error_message, /extension_not_accepted:\.exe/);
});

test('size > 100MB → rejected', () => {
    const r = validateFile(Object.assign({}, baseMsg, { size_bytes: 200 * 1024 * 1024 }), env);
    assert.equal(r.ok, false);
    assert.match(r.dlq.error_message, /size_exceeded/);
});

test('non-regular file (is_regular=false) → rejected', () => {
    const r = validateFile(Object.assign({}, baseMsg, { is_regular: false }), env);
    assert.equal(r.ok, false);
    assert.match(r.dlq.error_message, /not_regular_file/);
});

test('multiple violations are concatenated in error_message', () => {
    const r = validateFile(Object.assign({}, baseMsg, {
        ext: '.exe',
        size_bytes: 200 * 1024 * 1024,
        is_regular: false
    }), env);
    assert.equal(r.ok, false);
    assert.match(r.dlq.error_message, /extension_not_accepted/);
    assert.match(r.dlq.error_message, /size_exceeded/);
    assert.match(r.dlq.error_message, /not_regular_file/);
});

test('custom INGEST_ACCEPTED_EXTENSIONS env extends the allowlist', () => {
    const customEnv = { INGEST_ACCEPTED_EXTENSIONS: '.parquet,.json' };
    const r = validateFile(Object.assign({}, baseMsg, { ext: '.parquet' }), customEnv);
    assert.equal(r.ok, true);
});

test('size === 100MB exactly is accepted (boundary)', () => {
    const r = validateFile(Object.assign({}, baseMsg, { size_bytes: 104857600 }), env);
    assert.equal(r.ok, true);
});
