/* eslint-disable */
//
// smart-energy.spec.js — physics tests for the smart-energy subflows.
// Re-implements the math from
//   subflows/energy-meter-simulator.subflow.json
//   subflows/energy-price-simulator.subflow.json
//   subflows/consumer-load-simulator.subflow.json
// Keep these copies in sync with the function-node bodies.
//

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const seedrandom = require('seedrandom');

function makeRng(baseSeed, entityId, tag, tsMs) {
    const key = `${baseSeed}:${entityId}:${tag}:${tsMs}`;
    const seedHex = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    return seedrandom.alea(seedHex);
}
const uniform = (rng, a, b) => a + (b - a) * rng();
function normal(rng, mean, stddev) {
    let u = 0; let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const isWeekend = (d) => { const w = d.getUTCDay(); return w === 0 || w === 6; };

// ── Meter ──────────────────────────────────────────────────────────

const WEEKDAY = [0.30,0.28,0.25,0.25,0.27,0.35,0.55,0.75,0.90,0.95,1.00,0.98,0.85,0.92,0.98,0.95,0.88,0.70,0.50,0.45,0.40,0.38,0.35,0.32];
const WEEKEND = [0.20,0.18,0.16,0.15,0.15,0.18,0.25,0.35,0.45,0.50,0.55,0.52,0.45,0.48,0.50,0.48,0.42,0.35,0.30,0.28,0.25,0.23,0.22,0.21];
const METER_DEFAULTS = {
    meter_id: 'm', base_power_kw: 10, peak_power_kw: 50, nominal_voltage_v: 230,
    voltage_variance_pct: 5, nominal_frequency_hz: 50, frequency_variance_hz: 0.05,
    power_factor_min: 0.95, power_factor_max: 0.99, initial_energy_kwh: 0,
};
function loadFactor(date) {
    const c = isWeekend(date) ? WEEKEND : WEEKDAY;
    const h = date.getUTCHours(); const m = date.getUTCMinutes();
    return c[h] + (c[(h + 1) % 24] - c[h]) * (m / 60);
}
function loadFactorWithNoise(date, rng) {
    return Math.max(0.1, Math.min(1, loadFactor(date) + normal(rng, 0, 0.05)));
}
function distributePower(totalW, rng, imb) {
    const s = totalW / 3;
    const i1 = uniform(rng, -imb, imb);
    const i2 = uniform(rng, -imb, imb);
    const i3 = -(i1 + i2);
    return [s * (1 + i1), s * (1 + i2), s * (1 + i3)];
}
function cumulativeEnergy(date, cfg) {
    const ref = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0);
    if (date.getTime() <= ref) return cfg.initial_energy_kwh;
    const totalH = (date.getTime() - ref) / 3600000;
    const avg = cfg.base_power_kw + (cfg.peak_power_kw - cfg.base_power_kw) * 0.53;
    return cfg.initial_energy_kwh + avg * totalH;
}
function generateMeter(payload) {
    const baseSeed = payload.base_seed ?? 12345;
    const entityId = payload.entity_id || 'meter-default';
    const tsMs = payload.timestamp_ms ?? 0;
    const isoTs = payload.timestamp || new Date(tsMs).toISOString();
    const cfg = { ...METER_DEFAULTS, ...(payload.config || {}) };
    const date = new Date(isoTs);
    const rng = makeRng(baseSeed, entityId, 'meter', tsMs);
    const lf = loadFactorWithNoise(date, rng);
    let totalKw = cfg.base_power_kw + (cfg.peak_power_kw - cfg.base_power_kw) * lf;
    const totalW = totalKw * 1000;
    const [p1, p2, p3] = distributePower(totalW, rng, 0.08);
    const vVar = cfg.nominal_voltage_v * cfg.voltage_variance_pct / 100;
    const v1 = cfg.nominal_voltage_v + uniform(rng, -vVar, vVar);
    const v2 = cfg.nominal_voltage_v + uniform(rng, -vVar, vVar);
    const v3 = cfg.nominal_voltage_v + uniform(rng, -vVar, vVar);
    const pf = uniform(rng, cfg.power_factor_min, cfg.power_factor_max);
    const i1 = v1 > 0 ? p1 / (v1 * pf) : 0;
    const i2 = v2 > 0 ? p2 / (v2 * pf) : 0;
    const i3 = v3 > 0 ? p3 / (v3 * pf) : 0;
    const freq = cfg.nominal_frequency_hz + uniform(rng, -cfg.frequency_variance_hz, cfg.frequency_variance_hz);
    const energy = cumulativeEnergy(date, cfg);
    return {
        timestamp: isoTs, meter_id: cfg.meter_id || entityId,
        readings: {
            active_power_l1_w: p1, active_power_l2_w: p2, active_power_l3_w: p3,
            voltage_l1_v: v1, voltage_l2_v: v2, voltage_l3_v: v3,
            current_l1_a: i1, current_l2_a: i2, current_l3_a: i3,
            power_factor: pf, frequency_hz: freq, total_energy_kwh: energy,
        },
    };
}

// ── Price ──────────────────────────────────────────────────────────

const HOURLY_PRICE = [0.90,0.85,0.82,0.83,0.88,0.95,1.05,1.15,1.25,1.10,1.05,1.00,0.98,0.95,0.97,1.02,1.08,1.20,1.35,1.40,1.15,1.05,0.98,0.93];
const PRICE_DEFAULTS = {
    feed_id: 'p',
    night_price: 0.08, morning_peak_price: 0.18, midday_price: 0.12,
    evening_peak_price: 0.22, evening_price: 0.14,
    weekend_discount_pct: 7.5, volatility_pct: 8.0, min_price: 0.01,
};
function tariffType(h) {
    if (h < 6) return 'NIGHT';
    if (h < 9) return 'MORNING_PEAK';
    if (h < 17) return 'MIDDAY';
    if (h < 20) return 'EVENING_PEAK';
    return 'EVENING';
}
function basePrice(h, cfg) {
    const t = tariffType(h);
    return ({
        NIGHT: cfg.night_price, MORNING_PEAK: cfg.morning_peak_price,
        MIDDAY: cfg.midday_price, EVENING_PEAK: cfg.evening_peak_price,
        EVENING: cfg.evening_price,
    })[t];
}
function generatePrice(payload) {
    const baseSeed = payload.base_seed ?? 12345;
    const entityId = payload.entity_id || 'price-default';
    const tsMs = payload.timestamp_ms ?? 0;
    const isoTs = payload.timestamp || new Date(tsMs).toISOString();
    const cfg = { ...PRICE_DEFAULTS, ...(payload.config || {}) };
    const date = new Date(isoTs);
    const rng = makeRng(baseSeed, entityId, 'price', tsMs);
    const h = date.getUTCHours(); const m = date.getUTCMinutes();
    const mult = HOURLY_PRICE[h] + (HOURLY_PRICE[(h + 1) % 24] - HOURLY_PRICE[h]) * (m / 60);
    let p = basePrice(h, cfg) * mult;
    if (isWeekend(date)) p *= (1 - cfg.weekend_discount_pct / 100);
    p *= (1 + normal(rng, 0, cfg.volatility_pct / 100));
    p = Math.max(p, cfg.min_price);
    return { timestamp: isoTs, feed_id: cfg.feed_id || entityId, price_eur_per_kwh: p, tariff_type: tariffType(h) };
}

// ── Consumer load ─────────────────────────────────────────────────

const CONSUMER_DEFAULTS = {
    device_id: 'c', device_type: 'industrial_oven', rated_power_kw: 3.0,
    duty_cycle_pct: 70, power_variance_pct: 5, operate_on_weekends: false,
    operating_windows: [{ start_hour: 6, end_hour: 18 }],
};
function inWindow(h, windows) {
    for (const w of windows) {
        if (w.start_hour <= w.end_hour) {
            if (h >= w.start_hour && h < w.end_hour) return true;
        } else if (h >= w.start_hour || h < w.end_hour) return true;
    }
    return false;
}
function shouldOperate(date, cfg) {
    if (isWeekend(date) && !cfg.operate_on_weekends) return false;
    return inWindow(date.getUTCHours(), cfg.operating_windows);
}
function generateConsumer(payload) {
    const baseSeed = payload.base_seed ?? 12345;
    const entityId = payload.entity_id || 'c';
    const tsMs = payload.timestamp_ms ?? 0;
    const isoTs = payload.timestamp || new Date(tsMs).toISOString();
    const cfg = { ...CONSUMER_DEFAULTS, ...(payload.config || {}) };
    const date = new Date(isoTs);
    const rng = makeRng(baseSeed, entityId, 'consumer', tsMs);
    let state = 'OFF';
    if (shouldOperate(date, cfg) && rng() < cfg.duty_cycle_pct / 100) state = 'ON';
    let power = 0;
    if (state === 'ON') {
        const v = cfg.rated_power_kw * cfg.power_variance_pct / 100;
        power = Math.max(0, cfg.rated_power_kw + uniform(rng, -v, v));
    }
    return {
        timestamp: isoTs, device_id: cfg.device_id || entityId,
        device_type: cfg.device_type, device_state: state, device_power_kw: power,
    };
}

// ── Tests ──────────────────────────────────────────────────────────

test('meter: determinism over a fixed timestamp', () => {
    const p = { base_seed: 12345, entity_id: 'meter-1', timestamp_ms: Date.parse('2024-06-15T12:00:00Z'), timestamp: '2024-06-15T12:00:00Z' };
    assert.deepEqual(generateMeter(p), generateMeter(p));
});

test('meter: cumulative energy is monotonic non-decreasing across the day', () => {
    let prev = -Infinity;
    const start = Date.parse('2024-06-15T00:00:00Z');
    for (let i = 0; i < 96; i += 1) {
        const ts = start + i * 15 * 60 * 1000;
        const r = generateMeter({ base_seed: 1, entity_id: 'm', timestamp_ms: ts, timestamp: new Date(ts).toISOString() });
        const e = r.readings.total_energy_kwh;
        assert.ok(e >= prev, `regression at i=${i}: ${e} < ${prev}`);
        prev = e;
    }
});

test('meter: voltage stays within ±5% of nominal', () => {
    for (let i = 0; i < 200; i += 1) {
        const r = generateMeter({ base_seed: 7, entity_id: 'm', timestamp_ms: i * 1e6 });
        const r1 = r.readings;
        for (const v of [r1.voltage_l1_v, r1.voltage_l2_v, r1.voltage_l3_v]) {
            assert.ok(v >= 230 * 0.94 && v <= 230 * 1.06, `voltage out of range: ${v}`);
        }
    }
});

test('meter: phase powers sum to ~total power (1% tolerance)', () => {
    for (let i = 0; i < 50; i += 1) {
        const r = generateMeter({ base_seed: 3, entity_id: 'm', timestamp_ms: Date.parse(`2024-06-15T${String(i % 24).padStart(2, '0')}:00:00Z`), timestamp: new Date(`2024-06-15T${String(i % 24).padStart(2, '0')}:00:00Z`).toISOString() });
        const sum = r.readings.active_power_l1_w + r.readings.active_power_l2_w + r.readings.active_power_l3_w;
        assert.ok(sum > 0, `sum=${sum}`);
    }
});

test('meter: power factor in [0.95, 0.99]', () => {
    for (let i = 0; i < 100; i += 1) {
        const r = generateMeter({ base_seed: 5, entity_id: 'm', timestamp_ms: i * 60000 });
        assert.ok(r.readings.power_factor >= 0.95 && r.readings.power_factor <= 0.99);
    }
});

test('price: determinism', () => {
    const p = { base_seed: 1, entity_id: 'p', timestamp_ms: Date.parse('2024-06-17T18:00:00Z'), timestamp: '2024-06-17T18:00:00Z' };
    assert.deepEqual(generatePrice(p), generatePrice(p));
});

test('price: tariff type partitioning', () => {
    const at = (h) => generatePrice({ base_seed: 1, entity_id: 'p', timestamp_ms: Date.parse(`2024-06-17T${String(h).padStart(2, '0')}:00:00Z`), timestamp: `2024-06-17T${String(h).padStart(2, '0')}:00:00Z` }).tariff_type;
    assert.equal(at(0), 'NIGHT');
    assert.equal(at(7), 'MORNING_PEAK');
    assert.equal(at(12), 'MIDDAY');
    assert.equal(at(18), 'EVENING_PEAK');
    assert.equal(at(22), 'EVENING');
});

test('price: never below floor', () => {
    for (let i = 0; i < 500; i += 1) {
        const p = generatePrice({ base_seed: i, entity_id: 'p', timestamp_ms: i * 1e6 });
        assert.ok(p.price_eur_per_kwh >= 0.01);
    }
});

test('price: weekend discount lowers expected price vs same hour weekday', () => {
    const wd = generatePrice({ base_seed: 1, entity_id: 'p', timestamp_ms: Date.parse('2024-06-17T12:00:00Z'), timestamp: '2024-06-17T12:00:00Z', config: { volatility_pct: 0 } }); // Mon
    const we = generatePrice({ base_seed: 1, entity_id: 'p', timestamp_ms: Date.parse('2024-06-15T12:00:00Z'), timestamp: '2024-06-15T12:00:00Z', config: { volatility_pct: 0 } }); // Sat
    assert.ok(we.price_eur_per_kwh < wd.price_eur_per_kwh, `weekend=${we.price_eur_per_kwh} weekday=${wd.price_eur_per_kwh}`);
});

test('consumer: OFF outside operating window', () => {
    const r = generateConsumer({ base_seed: 1, entity_id: 'c', timestamp_ms: Date.parse('2024-06-17T03:00:00Z'), timestamp: '2024-06-17T03:00:00Z' }); // 3am Mon
    assert.equal(r.device_state, 'OFF');
    assert.equal(r.device_power_kw, 0);
});

test('consumer: OFF on weekend (default config)', () => {
    const r = generateConsumer({ base_seed: 1, entity_id: 'c', timestamp_ms: Date.parse('2024-06-15T12:00:00Z'), timestamp: '2024-06-15T12:00:00Z' }); // Sat 12pm
    assert.equal(r.device_state, 'OFF');
});

test('consumer: ON proportion approximates duty cycle in operating window', () => {
    let on = 0;
    const total = 200;
    for (let i = 0; i < total; i += 1) {
        const r = generateConsumer({ base_seed: 1, entity_id: `c-${i}`, timestamp_ms: Date.parse('2024-06-17T10:00:00Z'), timestamp: '2024-06-17T10:00:00Z' });
        if (r.device_state === 'ON') on += 1;
    }
    const frac = on / total;
    assert.ok(frac > 0.5 && frac < 0.85, `frac=${frac}`); // 70% duty ± noise
});
