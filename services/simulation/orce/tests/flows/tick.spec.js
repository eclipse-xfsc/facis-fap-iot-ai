/* eslint-disable */
//
// tick.spec.js — tick-scheduler logic.
//
// Re-implements the scheduling math from the function node in
// `services/simulation/orce/flows/facis-simulation-tick.json` so the
// behaviour can be exercised without booting Node-RED.
//
// **Invariant**: keep `realIntervalMs` and `fireTick` below in sync with the
// function node's On Start handler.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function makeScheduler({
    intervalMinutes = 1,
    minRealMs = 50,
    siteId = 'site-default',
    mode = 'normal',
} = {}) {
    const advanceMs = intervalMinutes * 60_000;
    const flowCtx = {};

    function realIntervalMs() {
        const engine = flowCtx.engine;
        const speed = engine && engine.acceleration ? engine.acceleration : 1;
        return Math.max(minRealMs, advanceMs / Math.max(0.001, speed));
    }

    const sent = [];
    function fireTick() {
        const engine = flowCtx.engine;
        if (!engine || engine.state !== 'running') return;
        const prevIso = engine.simulation_time || new Date().toISOString();
        const nextMs = new Date(prevIso).getTime() + advanceMs;
        const nextIso = new Date(nextMs).toISOString();
        engine.simulation_time = nextIso;
        engine.tick_index = (engine.tick_index || 0) + 1;
        flowCtx.engine = engine;
        sent.push({
            type: 'sim.tick.trigger',
            tick_index: engine.tick_index,
            timestamp: nextIso,
            timestamp_ms: nextMs,
            base_seed: engine.seed,
            site_id: siteId,
            acceleration: engine.acceleration,
            mode,
        });
    }

    return { flowCtx, realIntervalMs, fireTick, sent, advanceMs };
}

// ── 1. Real-interval calculation ──────────────────────────────────

test('realIntervalMs scales inversely with acceleration', () => {
    const s = makeScheduler({ intervalMinutes: 1 });
    s.flowCtx.engine = { acceleration: 1, state: 'running' };
    assert.equal(s.realIntervalMs(), 60_000);
    s.flowCtx.engine.acceleration = 60;
    assert.equal(s.realIntervalMs(), 1000);
    s.flowCtx.engine.acceleration = 600;
    assert.equal(s.realIntervalMs(), 100);
});

test('realIntervalMs is floored at MIN_REAL_INTERVAL_MS', () => {
    const s = makeScheduler({ intervalMinutes: 1, minRealMs: 50 });
    s.flowCtx.engine = { acceleration: 100_000, state: 'running' };
    assert.equal(s.realIntervalMs(), 50);
});

test('realIntervalMs falls back to acceleration=1 when engine missing', () => {
    const s = makeScheduler({ intervalMinutes: 1 });
    assert.equal(s.realIntervalMs(), 60_000);
});

// ── 2. fireTick gating on FSM ──────────────────────────────────────

test('fireTick emits when state=running', () => {
    const s = makeScheduler();
    s.flowCtx.engine = {
        state: 'running',
        seed: 12345,
        acceleration: 60,
        simulation_time: '2024-06-15T12:00:00.000Z',
    };
    s.fireTick();
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].type, 'sim.tick.trigger');
    assert.equal(s.sent[0].timestamp, '2024-06-15T12:01:00.000Z');
    assert.equal(s.sent[0].base_seed, 12345);
    assert.equal(s.sent[0].acceleration, 60);
});

test('fireTick is a no-op when state=initialized', () => {
    const s = makeScheduler();
    s.flowCtx.engine = {
        state: 'initialized',
        seed: 1,
        acceleration: 1,
        simulation_time: '2024-06-15T12:00:00.000Z',
    };
    s.fireTick();
    assert.equal(s.sent.length, 0);
});

test('fireTick is a no-op when state=paused', () => {
    const s = makeScheduler();
    s.flowCtx.engine = {
        state: 'paused',
        seed: 1,
        acceleration: 1,
        simulation_time: '2024-06-15T12:00:00.000Z',
    };
    s.fireTick();
    assert.equal(s.sent.length, 0);
});

test('fireTick is a no-op when engine missing', () => {
    const s = makeScheduler();
    s.fireTick();
    assert.equal(s.sent.length, 0);
});

// ── 3. Time advancement ────────────────────────────────────────────

test('three consecutive ticks advance simulation_time by 3 * intervalMinutes', () => {
    const s = makeScheduler({ intervalMinutes: 1 });
    s.flowCtx.engine = {
        state: 'running',
        seed: 1,
        acceleration: 60,
        simulation_time: '2024-06-15T12:00:00.000Z',
    };
    s.fireTick();
    s.fireTick();
    s.fireTick();
    assert.equal(s.sent.length, 3);
    assert.equal(s.sent[0].timestamp, '2024-06-15T12:01:00.000Z');
    assert.equal(s.sent[1].timestamp, '2024-06-15T12:02:00.000Z');
    assert.equal(s.sent[2].timestamp, '2024-06-15T12:03:00.000Z');
    assert.equal(s.flowCtx.engine.tick_index, 3);
});

test('15-minute interval honoured', () => {
    const s = makeScheduler({ intervalMinutes: 15 });
    s.flowCtx.engine = {
        state: 'running',
        seed: 1,
        acceleration: 1,
        simulation_time: '2024-06-15T12:00:00.000Z',
    };
    s.fireTick();
    assert.equal(s.sent[0].timestamp, '2024-06-15T12:15:00.000Z');
});

test('pause stops emission; resume picks back up at the next slot', () => {
    const s = makeScheduler({ intervalMinutes: 1 });
    s.flowCtx.engine = {
        state: 'running',
        seed: 1,
        acceleration: 1,
        simulation_time: '2024-06-15T12:00:00.000Z',
    };
    s.fireTick();
    s.fireTick();
    s.flowCtx.engine.state = 'paused';
    s.fireTick();
    s.fireTick();
    assert.equal(s.sent.length, 2);
    s.flowCtx.engine.state = 'running';
    s.fireTick();
    assert.equal(s.sent.length, 3);
    assert.equal(s.sent[2].timestamp, '2024-06-15T12:03:00.000Z');
});
