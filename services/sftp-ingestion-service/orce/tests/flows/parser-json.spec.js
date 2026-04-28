/* eslint-disable */
//
// parser-json.spec.js — JSON parser parity with sftp_poller._parse_file()
// at sftp_poller.py:87-93.
//
// Handler under test lives in `sftp-fn-parse-json` of
// facis-sftp-parsers.json.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function parseJson(msg) {
    const filename = msg.filename;
    const srcTopic = msg.source_topic;
    const ts = msg.ingest_timestamp;
    let parsed;
    try {
        const text = msg.content.toString('utf8');
        parsed = JSON.parse(text);
    } catch (e) {
        return { records: null, dlq: {
            error_type: 'parse',
            error_message: 'json: ' + e.message,
            error_timestamp: 'fixed',
            filename: filename,
            source_topic: srcTopic
        }};
    }
    const records = Array.isArray(parsed) ? parsed : [parsed];
    return {
        records: records.map(r => ({
            filename: filename,
            source_topic: srcTopic,
            ingest_timestamp: ts,
            record: r
        })),
        dlq: null
    };
}

const baseMsg = {
    filename: 'reading.json',
    source_topic: 'sftp://host/ingest/reading.json',
    ingest_timestamp: '2026-04-07T12:00:00.000Z'
};

test('single object → single record', () => {
    const r = parseJson(Object.assign({}, baseMsg, {
        content: Buffer.from('{"meter_id":"meter-001","power_kw":42.5}', 'utf8')
    }));
    assert.equal(r.dlq, null);
    assert.equal(r.records.length, 1);
    assert.equal(r.records[0].record.meter_id, 'meter-001');
    assert.equal(r.records[0].record.power_kw, 42.5);
});

test('array of objects → one record per element', () => {
    const r = parseJson(Object.assign({}, baseMsg, {
        content: Buffer.from('[{"a":1},{"a":2},{"a":3}]', 'utf8')
    }));
    assert.equal(r.dlq, null);
    assert.equal(r.records.length, 3);
    assert.deepEqual(r.records.map(rec => rec.record.a), [1, 2, 3]);
});

test('empty array → 0 records', () => {
    const r = parseJson(Object.assign({}, baseMsg, {
        content: Buffer.from('[]', 'utf8')
    }));
    assert.equal(r.dlq, null);
    assert.equal(r.records.length, 0);
});

test('record carries filename, source_topic, ingest_timestamp through', () => {
    const r = parseJson(Object.assign({}, baseMsg, {
        content: Buffer.from('{"a":1}', 'utf8')
    }));
    const rec = r.records[0];
    assert.equal(rec.filename, baseMsg.filename);
    assert.equal(rec.source_topic, baseMsg.source_topic);
    assert.equal(rec.ingest_timestamp, baseMsg.ingest_timestamp);
});

test('malformed JSON → DLQ with error_type=parse', () => {
    const r = parseJson(Object.assign({}, baseMsg, {
        content: Buffer.from('not json', 'utf8')
    }));
    assert.equal(r.records, null);
    assert.equal(r.dlq.error_type, 'parse');
    assert.match(r.dlq.error_message, /^json:/);
    assert.equal(r.dlq.filename, baseMsg.filename);
    assert.equal(r.dlq.source_topic, baseMsg.source_topic);
});

test('numeric value preserved as number (not stringified)', () => {
    const r = parseJson(Object.assign({}, baseMsg, {
        content: Buffer.from('{"x":42}', 'utf8')
    }));
    assert.equal(typeof r.records[0].record.x, 'number');
});
