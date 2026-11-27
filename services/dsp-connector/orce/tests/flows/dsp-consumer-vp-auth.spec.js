/* eslint-disable */
//
// dsp-consumer-vp-auth.spec.js — NF-2 authenticated-hop coverage.
//
// Drives the REAL committed `func` strings via ../harness/run-node.js (no
// hand-mirrored logic to drift): the consumer's two internal provider hops
// (POST /dsp/transfers, GET /dsp/transfers/:id) attach the VP from iam.issue
// as an Authorization: Bearer header alongside Content-Type — the regression
// guard for the enforce-mode ingest path. The VP itself comes from the W-Stack
// (iam-issue-wstack.spec.js).
//
const test = require('node:test');
const assert = require('node:assert/strict');
const { runNode } = require('../harness/run-node.js');

const CONSUMER_FLOW = '../flows/facis-dsp-consumer.json';

const FAKE_VP = 'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ4In0.sig';

// ---- 1. hop headers carry the Bearer VP ----

test('prep-transfer: msg.vpToken becomes Authorization: Bearer on the POST hop, stashed for the GET hop', async () => {
    const r = await runNode(CONSUMER_FLOW, 'dsp-consumer-prep-transfer-fn', {
        msg: { vpToken: FAKE_VP, payload: { providerBaseUrl: 'https://p.example', assetId: 'a', agreementId: 'agr-1' } }
    });
    const out = r.result[1];
    assert.equal(out.headers['Content-Type'], 'application/json');
    assert.equal(out.headers['Authorization'], 'Bearer ' + FAKE_VP);
    assert.equal(out._dspConsumer.vp, FAKE_VP);
});

test('prep-transfer: no VP (mint failed / warn mode) → Content-Type only, no Authorization, still proceeds', async () => {
    const r = await runNode(CONSUMER_FLOW, 'dsp-consumer-prep-transfer-fn', {
        msg: { payload: { providerBaseUrl: 'https://p.example', assetId: 'a', agreementId: 'agr-1' } }
    });
    const out = r.result[1];
    assert.equal(out.headers['Content-Type'], 'application/json');
    assert.ok(!('Authorization' in out.headers));
    assert.equal(out._dspConsumer.vp, '');
});

test('prep-get-transfer: stashed VP becomes Authorization: Bearer on the GET hop', async () => {
    const r = await runNode(CONSUMER_FLOW, 'dsp-consumer-prep-get-transfer-fn', {
        msg: { statusCode: 202, payload: { transferId: 'tp-1' }, _dspConsumer: { providerBaseUrl: 'https://p.example', vp: FAKE_VP } }
    });
    const out = r.result[1];
    assert.equal(out.headers['Content-Type'], 'application/json');
    assert.equal(out.headers['Authorization'], 'Bearer ' + FAKE_VP);
});

test('prep-get-transfer: no stashed VP → Content-Type only, no Authorization', async () => {
    const r = await runNode(CONSUMER_FLOW, 'dsp-consumer-prep-get-transfer-fn', {
        msg: { statusCode: 202, payload: { transferId: 'tp-1' }, _dspConsumer: { providerBaseUrl: 'https://p.example' } }
    });
    const out = r.result[1];
    assert.equal(out.headers['Content-Type'], 'application/json');
    assert.ok(!('Authorization' in out.headers));
});
