/* eslint-disable */
//
// scheduler.spec.js — tick re-entry guard.
// Handler under test: sftp-fn-tick-guard in facis-sftp-scheduler.json.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function tickGuard(msg, ctx) {
    if (ctx.poll_inflight === true) {
        return null;
    }
    msg.tick_id = Date.now();
    ctx.poll_seq = (ctx.poll_seq || 0) + 1;
    msg.poll_seq = ctx.poll_seq;
    return msg;
}

test('first tick passes through with tick_id + poll_seq', () => {
    const ctx = {};
    const msg = tickGuard({}, ctx);
    assert.notEqual(msg, null);
    assert.equal(msg.poll_seq, 1);
    assert.equal(typeof msg.tick_id, 'number');
});

test('tick is dropped while a poll is in-flight', () => {
    const ctx = { poll_inflight: true };
    const msg = tickGuard({}, ctx);
    assert.equal(msg, null);
});

test('poll_seq increments across consecutive ticks', () => {
    const ctx = {};
    tickGuard({}, ctx);
    tickGuard({}, ctx);
    const m3 = tickGuard({}, ctx);
    assert.equal(m3.poll_seq, 3);
});
