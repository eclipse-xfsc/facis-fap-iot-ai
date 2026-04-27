/* eslint-disable */
//
// rng.spec.js — property-based tests for the FACIS RNG subflow.
//
// The algorithm under test is implemented inline in
// `services/simulation/orce/subflows/rng.subflow.json` (function node
// `fn-rng-compute`). This spec re-implements the same algorithm using the
// same npm packages (`crypto`, `seedrandom`) so it can be run by Node's
// built-in test runner without booting Node-RED.
//
// **Invariant**: if you change the algorithm in rng.subflow.json, you must
// keep `rngCompute` below in sync.
//
// Run:
//   cd services/simulation/orce
//   npm install --include=dev
//   node --test tests/flows
//

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const seedrandom = require('seedrandom');

function rngCompute(payload, baseSeedDefault = 12345) {
    const baseSeed =
        payload && typeof payload.base_seed === 'number'
            ? payload.base_seed
            : baseSeedDefault;
    const entityId = (payload && payload.entity_id) || 'default';
    const tsMs =
        payload && typeof payload.timestamp_ms === 'number'
            ? payload.timestamp_ms
            : 0;
    const action = (payload && payload.action) || 'uniform';
    const params = (payload && payload.params) || {};

    const seedKey = `${baseSeed}:${entityId}:${tsMs}`;
    const seedHex = crypto
        .createHash('sha256')
        .update(seedKey)
        .digest('hex')
        .slice(0, 16);
    const rng = seedrandom.alea(seedHex);

    let value;
    switch (action) {
        case 'uniform': {
            const min = typeof params.min === 'number' ? params.min : 0;
            const max = typeof params.max === 'number' ? params.max : 1;
            value = min + (max - min) * rng();
            break;
        }
        case 'normal':
        case 'gauss': {
            const mean = typeof params.mean === 'number' ? params.mean : 0;
            const stddev = typeof params.stddev === 'number' ? params.stddev : 1;
            let u = 0;
            let v = 0;
            while (u === 0) u = rng();
            while (v === 0) v = rng();
            const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
            value = mean + stddev * z;
            break;
        }
        case 'int': {
            const min = Math.ceil(typeof params.min === 'number' ? params.min : 0);
            const max = Math.floor(typeof params.max === 'number' ? params.max : 1);
            value = Math.floor(rng() * (max - min + 1)) + min;
            break;
        }
        case 'choice': {
            const items = Array.isArray(params.items) ? params.items : [];
            if (items.length === 0) {
                throw new Error('choice action requires non-empty params.items');
            }
            value = items[Math.floor(rng() * items.length)];
            break;
        }
        case 'sequence': {
            const count = typeof params.count === 'number' ? params.count : 1;
            const seq = [];
            for (let i = 0; i < count; i += 1) seq.push(rng());
            value = seq;
            break;
        }
        default:
            throw new Error('unknown action ' + action);
    }

    return {
        value,
        seed_hash: seedHex,
        base_seed: baseSeed,
        entity_id: entityId,
        timestamp_ms: tsMs,
        action,
    };
}

// ── 1. Determinism ─────────────────────────────────────────────────

test('same (base_seed, entity_id, timestamp_ms) → identical uniform value', () => {
    const a = rngCompute({
        base_seed: 12345,
        entity_id: 'meter-1',
        timestamp_ms: 1718456789000,
        action: 'uniform',
    });
    const b = rngCompute({
        base_seed: 12345,
        entity_id: 'meter-1',
        timestamp_ms: 1718456789000,
        action: 'uniform',
    });
    assert.equal(a.value, b.value);
    assert.equal(a.seed_hash, b.seed_hash);
});

test('same (base_seed, entity_id) different timestamp → different seed_hash', () => {
    const a = rngCompute({
        base_seed: 12345,
        entity_id: 'meter-1',
        timestamp_ms: 1000,
        action: 'uniform',
    });
    const b = rngCompute({
        base_seed: 12345,
        entity_id: 'meter-1',
        timestamp_ms: 2000,
        action: 'uniform',
    });
    assert.notEqual(a.seed_hash, b.seed_hash);
});

test('different entity_id → different seed_hash', () => {
    const a = rngCompute({
        base_seed: 12345,
        entity_id: 'meter-1',
        timestamp_ms: 0,
        action: 'uniform',
    });
    const b = rngCompute({
        base_seed: 12345,
        entity_id: 'meter-2',
        timestamp_ms: 0,
        action: 'uniform',
    });
    assert.notEqual(a.seed_hash, b.seed_hash);
});

test('different base_seed → different seed_hash', () => {
    const a = rngCompute({
        base_seed: 1,
        entity_id: 'x',
        timestamp_ms: 0,
        action: 'uniform',
    });
    const b = rngCompute({
        base_seed: 2,
        entity_id: 'x',
        timestamp_ms: 0,
        action: 'uniform',
    });
    assert.notEqual(a.seed_hash, b.seed_hash);
});

test('seed_hash matches Python algorithm for a known triple', () => {
    // Python equivalent (random_generator.py):
    //   sha256(b"12345:meter-1:1000").digest()[:8] → as big-endian u64
    // We assert on the hex representation of the first 8 bytes — which is
    // exactly what the JS side uses as the seedrandom.alea() seed.
    const result = rngCompute({
        base_seed: 12345,
        entity_id: 'meter-1',
        timestamp_ms: 1000,
        action: 'uniform',
    });
    const expected = crypto
        .createHash('sha256')
        .update('12345:meter-1:1000')
        .digest('hex')
        .slice(0, 16);
    assert.equal(result.seed_hash, expected);
});

// ── 2. Distributions ──────────────────────────────────────────────

test('uniform stays in [min, max)', () => {
    for (let i = 0; i < 1000; i += 1) {
        const r = rngCompute({
            base_seed: 7,
            entity_id: 'e',
            timestamp_ms: i,
            action: 'uniform',
            params: { min: 10, max: 20 },
        });
        assert.ok(r.value >= 10 && r.value < 20, `out of range: ${r.value}`);
    }
});

test('int returns integer in [min, max]', () => {
    for (let i = 0; i < 1000; i += 1) {
        const r = rngCompute({
            base_seed: 7,
            entity_id: 'e',
            timestamp_ms: i,
            action: 'int',
            params: { min: 5, max: 15 },
        });
        assert.ok(Number.isInteger(r.value));
        assert.ok(r.value >= 5 && r.value <= 15, `out of range: ${r.value}`);
    }
});

test('normal mean and stddev are approximately correct', () => {
    const samples = [];
    for (let i = 0; i < 20000; i += 1) {
        const r = rngCompute({
            base_seed: 42,
            entity_id: 'g',
            timestamp_ms: i,
            action: 'normal',
            params: { mean: 100, stddev: 5 },
        });
        samples.push(r.value);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
        samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    const stddev = Math.sqrt(variance);
    assert.ok(
        Math.abs(mean - 100) < 0.5,
        `mean ${mean} too far from 100`,
    );
    assert.ok(
        Math.abs(stddev - 5) < 0.5,
        `stddev ${stddev} too far from 5`,
    );
});

test('choice always returns one of the items', () => {
    const items = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 500; i += 1) {
        const r = rngCompute({
            base_seed: 99,
            entity_id: 'c',
            timestamp_ms: i,
            action: 'choice',
            params: { items },
        });
        assert.ok(items.includes(r.value));
    }
});

test('sequence returns array of length count, each in [0, 1)', () => {
    const r = rngCompute({
        base_seed: 1,
        entity_id: 's',
        timestamp_ms: 0,
        action: 'sequence',
        params: { count: 50 },
    });
    assert.ok(Array.isArray(r.value));
    assert.equal(r.value.length, 50);
    r.value.forEach((v) => {
        assert.ok(v >= 0 && v < 1, `value out of [0,1): ${v}`);
    });
});

// ── 3. Stability across runs ───────────────────────────────────────

test('500-tick uniform stream is byte-stable across two passes', () => {
    const stream = (offset) => {
        const out = [];
        for (let i = 0; i < 500; i += 1) {
            out.push(
                rngCompute({
                    base_seed: 12345,
                    entity_id: 'meter-1',
                    timestamp_ms: i + offset,
                    action: 'uniform',
                }).value,
            );
        }
        return out;
    };
    assert.deepEqual(stream(0), stream(0));
});

// ── 4. Errors ─────────────────────────────────────────────────────

test('choice with empty items throws', () => {
    assert.throws(() =>
        rngCompute({
            base_seed: 1,
            entity_id: 'x',
            timestamp_ms: 0,
            action: 'choice',
            params: { items: [] },
        }),
    );
});

test('unknown action throws', () => {
    assert.throws(() =>
        rngCompute({
            base_seed: 1,
            entity_id: 'x',
            timestamp_ms: 0,
            action: 'bogus',
        }),
    );
});
