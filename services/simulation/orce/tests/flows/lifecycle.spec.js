/* eslint-disable */
//
// lifecycle.spec.js — FSM transitions for the engine flow.
//
// The handlers under test live inline in the function nodes of
// `services/simulation/orce/flows/facis-simulation-engine.json`. This spec
// re-implements the same logic so we can exercise it under `node --test`.
//
// **Invariant**: keep these handlers in sync with the function-node bodies
// in facis-simulation-engine.json (fn-status / fn-start / fn-pause / fn-reset).
//
// Run:
//   cd services/simulation/orce
//   node --test tests/flows
//

const test = require('node:test');
const assert = require('node:assert/strict');

function defaultEngine({ baseSeed = 12345, speedFactor = 1 } = {}) {
    return {
        state: 'initialized',
        simulation_time: new Date().toISOString(),
        seed: baseSeed,
        acceleration: speedFactor,
        registered_entities: 0,
        last_transition_at: Date.now(),
    };
}

function status(ctx) {
    const engine = ctx.engine || defaultEngine();
    return {
        body: {
            state: engine.state,
            simulation_time: engine.simulation_time,
            seed: engine.seed,
            acceleration: engine.acceleration,
            registered_entities: engine.registered_entities || 0,
        },
    };
}

function start(ctx, body = {}) {
    const engine = ctx.engine || defaultEngine();
    if (typeof body.start_time === 'string' && body.start_time.length > 0) {
        engine.simulation_time = body.start_time;
    }
    let message;
    if (engine.state === 'paused') {
        engine.state = 'running';
        message = 'Simulation resumed';
    } else if (engine.state === 'running') {
        message = 'Simulation already running';
    } else {
        engine.state = 'running';
        if (!engine.simulation_time) {
            engine.simulation_time = new Date().toISOString();
        }
        message = 'Simulation started';
    }
    engine.last_transition_at = Date.now();
    ctx.engine = engine;
    return {
        body: {
            status: 'started',
            message,
            simulation_time: engine.simulation_time,
        },
    };
}

function pause(ctx) {
    const engine = ctx.engine || defaultEngine();
    let message;
    if (engine.state === 'running') {
        engine.state = 'paused';
        message = 'Simulation paused';
    } else {
        message = `Simulation was not running (state: ${engine.state})`;
    }
    engine.last_transition_at = Date.now();
    ctx.engine = engine;
    return {
        body: {
            status: 'paused',
            message,
            simulation_time: engine.simulation_time,
        },
    };
}

function reset(ctx, body = {}) {
    const engine = ctx.engine || defaultEngine();
    if (typeof body.seed === 'number') {
        engine.seed = body.seed;
    }
    if (typeof body.start_time === 'string' && body.start_time.length > 0) {
        engine.simulation_time = body.start_time;
    } else {
        engine.simulation_time = new Date().toISOString();
    }
    engine.state = 'initialized';
    engine.last_transition_at = Date.now();
    ctx.engine = engine;
    return {
        body: {
            status: 'reset',
            message: 'Simulation reset to initial state',
            seed: engine.seed,
            simulation_time: engine.simulation_time,
        },
    };
}

// ── 1. FSM happy-path transitions ──────────────────────────────────

test('initial state is initialized', () => {
    const ctx = {};
    const r = status(ctx);
    assert.equal(r.body.state, 'initialized');
});

test('start: initialized → running', () => {
    const ctx = {};
    const r = start(ctx, {});
    assert.equal(r.body.status, 'started');
    assert.equal(r.body.message, 'Simulation started');
    assert.equal(ctx.engine.state, 'running');
});

test('start: running → running (idempotent)', () => {
    const ctx = {};
    start(ctx, {});
    const r = start(ctx, {});
    assert.equal(r.body.message, 'Simulation already running');
    assert.equal(ctx.engine.state, 'running');
});

test('pause: running → paused', () => {
    const ctx = {};
    start(ctx, {});
    const r = pause(ctx);
    assert.equal(r.body.message, 'Simulation paused');
    assert.equal(ctx.engine.state, 'paused');
});

test('start: paused → running (resume)', () => {
    const ctx = {};
    start(ctx, {});
    pause(ctx);
    const r = start(ctx, {});
    assert.equal(r.body.message, 'Simulation resumed');
    assert.equal(ctx.engine.state, 'running');
});

test('pause: initialized → no-op (state remains initialized)', () => {
    const ctx = {};
    const r = pause(ctx);
    assert.match(r.body.message, /not running/);
    assert.equal(ctx.engine.state, 'initialized');
});

test('reset: any → initialized, returns current seed', () => {
    const ctx = {};
    start(ctx, {});
    const r = reset(ctx, {});
    assert.equal(r.body.status, 'reset');
    assert.equal(ctx.engine.state, 'initialized');
    assert.equal(r.body.seed, ctx.engine.seed);
});

test('reset: optional seed override', () => {
    const ctx = {};
    const r = reset(ctx, { seed: 99999 });
    assert.equal(ctx.engine.seed, 99999);
    assert.equal(r.body.seed, 99999);
});

test('reset: optional start_time override', () => {
    const ctx = {};
    const r = reset(ctx, { start_time: '2024-06-15T12:00:00Z' });
    assert.equal(r.body.simulation_time, '2024-06-15T12:00:00Z');
    assert.equal(ctx.engine.simulation_time, '2024-06-15T12:00:00Z');
});

// ── 2. Response shapes match the Python schemas ────────────────────

test('status response has all required keys', () => {
    const ctx = {};
    const r = status(ctx);
    for (const k of [
        'state',
        'simulation_time',
        'seed',
        'acceleration',
        'registered_entities',
    ]) {
        assert.ok(k in r.body, `missing key: ${k}`);
    }
});

test('start response has all required keys', () => {
    const ctx = {};
    const r = start(ctx, {});
    for (const k of ['status', 'message', 'simulation_time']) {
        assert.ok(k in r.body, `missing key: ${k}`);
    }
});

test('reset response carries seed alongside the canonical message', () => {
    const ctx = {};
    const r = reset(ctx, { seed: 7 });
    assert.equal(r.body.message, 'Simulation reset to initial state');
    assert.equal(r.body.seed, 7);
});

// ── 3. Persistence round-trip ──────────────────────────────────────

test('persisted state survives a restart simulation', () => {
    const ctxBefore = {};
    start(ctxBefore, { start_time: '2024-06-15T12:00:00Z' });
    const persisted = JSON.parse(JSON.stringify(ctxBefore.engine));

    const ctxAfter = { engine: persisted };
    const r = status(ctxAfter);
    assert.equal(r.body.state, 'running');
    assert.equal(r.body.simulation_time, '2024-06-15T12:00:00Z');
});
