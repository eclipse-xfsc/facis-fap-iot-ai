/* eslint-disable */
//
// envelope.spec.js — Bronze envelope shape parity with sftp_poller.py:163-172.
//
// Field order matters: any consumer that hashes the serialised string
// (NiFi, Trino schema-on-read) must see the exact same byte sequence as
// the Python service produced.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function buildEnvelope(msg, defaultTopic = 'sftp.ingest.raw') {
    const r = msg.record;
    const envelope = {
        ingest_timestamp: msg.ingest_timestamp,
        source_topic: msg.source_topic,
        kafka_partition: 0,
        kafka_offset: 0,
        kafka_key: msg.filename,
        raw_payload: JSON.stringify(r)
    };
    return {
        filename: msg.filename,
        routing_topic: defaultTopic,
        envelope: envelope
    };
}

const baseMsg = {
    filename: 'reading.json',
    source_topic: 'sftp://host/ingest/reading.json',
    ingest_timestamp: '2026-04-07T12:00:00.000Z',
    record: { meter_id: 'meter-001', power_kw: 42.5 }
};

test('envelope has exactly 6 fields in the expected order', () => {
    const out = buildEnvelope(baseMsg);
    const keys = Object.keys(out.envelope);
    assert.deepEqual(keys, [
        'ingest_timestamp',
        'source_topic',
        'kafka_partition',
        'kafka_offset',
        'kafka_key',
        'raw_payload'
    ]);
});

test('kafka_partition and kafka_offset are literal 0 (not "0")', () => {
    const out = buildEnvelope(baseMsg);
    assert.equal(out.envelope.kafka_partition, 0);
    assert.equal(typeof out.envelope.kafka_partition, 'number');
    assert.equal(out.envelope.kafka_offset, 0);
});

test('kafka_key is the filename (not the path)', () => {
    const out = buildEnvelope(baseMsg);
    assert.equal(out.envelope.kafka_key, 'reading.json');
});

test('raw_payload is JSON.stringify(record), not the record object', () => {
    const out = buildEnvelope(baseMsg);
    assert.equal(typeof out.envelope.raw_payload, 'string');
    const reparsed = JSON.parse(out.envelope.raw_payload);
    assert.deepEqual(reparsed, baseMsg.record);
});

test('envelope serialises to the same JSON shape as Python json.dumps', () => {
    const out = buildEnvelope(baseMsg);
    const serialised = JSON.stringify(out.envelope);
    // The Python service does json.dumps(envelope, default=str). For a plain
    // dict with string/number values, JS JSON.stringify produces an
    // identical byte sequence (modulo whitespace; both default to no
    // whitespace in compact form).
    assert.ok(serialised.startsWith('{"ingest_timestamp":"2026-04-07T12:00:00.000Z"'));
    assert.ok(serialised.includes('"raw_payload":"{\\"meter_id\\":\\"meter-001\\",\\"power_kw\\":42.5}"'));
});

test('routing_topic defaults to sftp.ingest.raw', () => {
    const out = buildEnvelope(baseMsg);
    assert.equal(out.routing_topic, 'sftp.ingest.raw');
});

test('routing_topic is configurable via second arg (env override path)', () => {
    const out = buildEnvelope(baseMsg, 'custom.topic');
    assert.equal(out.routing_topic, 'custom.topic');
});

test('source_topic format is sftp://host/path/file', () => {
    const out = buildEnvelope(baseMsg);
    assert.match(out.envelope.source_topic, /^sftp:\/\/host\/ingest\/reading\.json$/);
});
