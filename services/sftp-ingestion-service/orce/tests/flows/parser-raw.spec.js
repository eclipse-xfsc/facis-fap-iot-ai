/* eslint-disable */
//
// parser-raw.spec.js — fallback parser parity with sftp_poller.py:100-101.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function parseRaw(msg) {
    const raw = msg.content.toString('utf8');
    return [{
        filename: msg.filename,
        source_topic: msg.source_topic,
        ingest_timestamp: msg.ingest_timestamp,
        record: { raw_content: raw }
    }];
}

const baseMsg = {
    filename: 'data.avro',
    source_topic: 'sftp://host/ingest/data.avro',
    ingest_timestamp: '2026-04-07T12:00:00.000Z'
};

test('unsupported extension → single record with raw_content key', () => {
    const out = parseRaw(Object.assign({}, baseMsg, { content: Buffer.from('hello', 'utf8') }));
    assert.equal(out.length, 1);
    assert.equal(out[0].record.raw_content, 'hello');
});

test('binary content with invalid utf-8 byte → U+FFFD substitution (errors=replace parity)', () => {
    const buf = Buffer.from([0x80, 0x80]);
    const out = parseRaw(Object.assign({}, baseMsg, { content: buf }));
    // Python errors='replace' substitutes U+FFFD for each invalid byte.
    // Node Buffer.toString('utf8') does the same.
    assert.match(out[0].record.raw_content, /�/);
});

test('empty content → single record with empty raw_content', () => {
    const out = parseRaw(Object.assign({}, baseMsg, { content: Buffer.alloc(0) }));
    assert.equal(out.length, 1);
    assert.equal(out[0].record.raw_content, '');
});
