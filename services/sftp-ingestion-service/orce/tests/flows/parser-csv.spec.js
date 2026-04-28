/* eslint-disable */
//
// parser-csv.spec.js — CSV parser parity with csv.DictReader and the
// strict-mode tightening (relax_column_count: false).
//
// Handler under test lives in `sftp-fn-parse-csv` of facis-sftp-parsers.json.
// Uses csv-parse v5 sync API.
//

const test = require('node:test');
const assert = require('node:assert/strict');
const { parse: csvParseSync } = require('csv-parse/sync');

function parseCsv(msg) {
    const filename = msg.filename;
    const srcTopic = msg.source_topic;
    const ts = msg.ingest_timestamp;
    let rows;
    try {
        const text = msg.content.toString('utf8');
        rows = csvParseSync(text, {
            columns: true,
            skip_empty_lines: true,
            cast: false,
            relax_column_count: false
        });
    } catch (e) {
        return { records: null, dlq: {
            error_type: 'parse',
            error_message: 'csv: ' + e.message,
            filename: filename,
            source_topic: srcTopic
        }};
    }
    return {
        records: rows.map(r => ({
            filename: filename,
            source_topic: srcTopic,
            ingest_timestamp: ts,
            record: r
        })),
        dlq: null
    };
}

const baseMsg = {
    filename: 'data.csv',
    source_topic: 'sftp://host/ingest/data.csv',
    ingest_timestamp: '2026-04-07T12:00:00.000Z'
};

test('header + rows produce dict-shaped records', () => {
    const csv = 'meter_id,power_kw\nmeter-001,42.5\nmeter-002,17.2\n';
    const r = parseCsv(Object.assign({}, baseMsg, { content: Buffer.from(csv, 'utf8') }));
    assert.equal(r.dlq, null);
    assert.equal(r.records.length, 2);
    assert.deepEqual(Object.keys(r.records[0].record), ['meter_id', 'power_kw']);
});

test('values stay as strings (cast=false matches DictReader)', () => {
    const csv = 'a,b\n1,2.5\n';
    const r = parseCsv(Object.assign({}, baseMsg, { content: Buffer.from(csv, 'utf8') }));
    // DictReader returns "1" and "2.5" as strings; csv-parse with cast:false matches.
    assert.equal(r.records[0].record.a, '1');
    assert.equal(r.records[0].record.b, '2.5');
    assert.equal(typeof r.records[0].record.a, 'string');
});

test('header only (no rows) → 0 records', () => {
    const csv = 'a,b\n';
    const r = parseCsv(Object.assign({}, baseMsg, { content: Buffer.from(csv, 'utf8') }));
    assert.equal(r.dlq, null);
    assert.equal(r.records.length, 0);
});

test('blank lines between rows are skipped', () => {
    const csv = 'a,b\n1,2\n\n3,4\n';
    const r = parseCsv(Object.assign({}, baseMsg, { content: Buffer.from(csv, 'utf8') }));
    assert.equal(r.records.length, 2);
});

test('row with too few columns → DLQ (strict tightening vs Python)', () => {
    // Python csv.DictReader would silently produce {a:'1', b:None} for a 1-col row.
    // ORCE strict mode rejects it. Documented as a deliberate tightening.
    const csv = 'a,b\n1\n';
    const r = parseCsv(Object.assign({}, baseMsg, { content: Buffer.from(csv, 'utf8') }));
    assert.equal(r.records, null);
    assert.equal(r.dlq.error_type, 'parse');
});

test('row with too many columns → DLQ (strict tightening vs Python)', () => {
    const csv = 'a,b\n1,2,3\n';
    const r = parseCsv(Object.assign({}, baseMsg, { content: Buffer.from(csv, 'utf8') }));
    assert.equal(r.records, null);
    assert.equal(r.dlq.error_type, 'parse');
});

test('quoted fields with commas are parsed correctly', () => {
    const csv = 'name,note\n"Smith, John","hello, world"\n';
    const r = parseCsv(Object.assign({}, baseMsg, { content: Buffer.from(csv, 'utf8') }));
    assert.equal(r.dlq, null);
    assert.equal(r.records[0].record.name, 'Smith, John');
    assert.equal(r.records[0].record.note, 'hello, world');
});
