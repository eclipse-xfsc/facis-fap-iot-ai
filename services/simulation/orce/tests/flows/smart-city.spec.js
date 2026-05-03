/* eslint-disable */
//
// smart-city.spec.js — physics tests for the smart-city subflows.
// Re-implements the math from
//   subflows/streetlights-simulator.subflow.json
//   subflows/traffic-simulator.subflow.json
//   subflows/city-events-simulator.subflow.json
//   subflows/visibility-simulator.subflow.json
// Keep in sync with the function-node bodies.
//

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const seedrandom = require('seedrandom');

function makeRng(baseSeed, entityId, tag, tsMs) {
    const key = `${baseSeed}:${entityId}:${tag}:${tsMs}`;
    return seedrandom.alea(crypto.createHash('sha256').update(key).digest('hex').slice(0, 16));
}
const uniform = (rng, a, b) => a + (b - a) * rng();
const isWeekend = (d) => { const w = d.getUTCDay(); return w === 0 || w === 6; };
function dayOfYear(d) {
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    return Math.floor((d.getTime() - start) / 86400000);
}
function calcSunTimes(date, lat, lon) {
    const doy = dayOfYear(date);
    const decl = 23.45 * Math.sin((Math.PI / 180) * (360 / 365) * (doy - 81));
    const declRad = (decl * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    let cosHa = -Math.tan(latRad) * Math.tan(declRad);
    cosHa = Math.max(-1, Math.min(1, cosHa));
    const haDeg = (Math.acos(cosHa) * 180) / Math.PI;
    const noonH = 12 - lon / 15;
    const sunriseH = Math.max(0, Math.min(23.99, noonH - haDeg / 15));
    const sunsetH = Math.max(0, Math.min(23.99, noonH + haDeg / 15));
    return { sunriseH, sunsetH };
}

// ── Streetlight ────────────────────────────────────────────────────

function baseDimming(hour, sunrise, sunset) {
    const dawnStart = sunrise - 0.5;
    const dawnEnd = sunrise + 0.5;
    const duskStart = sunset - 0.5;
    const duskEnd = sunset + 0.5;
    if (hour < dawnStart || hour >= duskEnd) return 100;
    if (hour < dawnEnd) return 100 * (1 - (hour - dawnStart) / (dawnEnd - dawnStart));
    if (hour < duskStart) return 0;
    if (hour < duskEnd) return 100 * ((hour - duskStart) / (duskEnd - duskStart));
    return 0;
}
function generateStreetlight(payload) {
    const baseSeed = payload.base_seed ?? 12345;
    const entityId = payload.entity_id || 'l';
    const tsMs = payload.timestamp_ms ?? 0;
    const isoTs = payload.timestamp || new Date(tsMs).toISOString();
    const cfg = { light_id: 'l', zone_id: 'z', rated_power_w: 100, latitude: 52.52, longitude: 13.405, ...(payload.config || {}) };
    const date = new Date(isoTs);
    const rng = makeRng(baseSeed, entityId, 'light', tsMs);
    const { sunriseH, sunsetH } = calcSunTimes(date, cfg.latitude, cfg.longitude);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    let dim = baseDimming(hour, sunriseH, sunsetH);
    dim = Math.max(0, Math.min(100, dim + uniform(rng, -3, 3)));
    if (payload.active_event && payload.active_event.active && payload.active_event.zone_id === cfg.zone_id) {
        const sev = typeof payload.active_event.severity === 'number'
            ? payload.active_event.severity
            : payload.active_event.severity === 'HIGH'
                ? 3
                : payload.active_event.severity === 'MEDIUM'
                    ? 2
                    : 1;
        if (sev >= 3) dim += 50;
        else if (sev >= 2) dim += 30;
        dim = Math.min(100, dim);
    }
    return { dimming_level_pct: dim, power_w: (dim / 100) * cfg.rated_power_w, zone_id: cfg.zone_id };
}

// ── Traffic ────────────────────────────────────────────────────────

function baseTraffic(hour, weekend) {
    let i;
    if (hour < 5) i = 10;
    else if (hour < 7) i = 10 + 55 * ((hour - 5) / 2);
    else if (hour < 9) { const pf = 1 - Math.abs(hour - 8); i = 65 + 20 * pf; }
    else if (hour < 10) i = 65 - 25 * (hour - 9);
    else if (hour < 16) i = 40;
    else if (hour < 17) i = 40 + 30 * (hour - 16);
    else if (hour < 19) { const pf = 1 - Math.abs(hour - 18); i = 70 + 15 * pf; }
    else if (hour < 21) i = 70 - 40 * ((hour - 19) / 2);
    else if (hour < 23) i = 30 - 15 * ((hour - 21) / 2);
    else i = 10;
    if (weekend) i *= 0.7;
    return Math.max(0, Math.min(100, i));
}
function generateTraffic(payload) {
    const baseSeed = payload.base_seed ?? 12345;
    const entityId = payload.entity_id || 't';
    const tsMs = payload.timestamp_ms ?? 0;
    const isoTs = payload.timestamp || new Date(tsMs).toISOString();
    const date = new Date(isoTs);
    const rng = makeRng(baseSeed, entityId, 'traffic', tsMs);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    const idx = Math.max(0, Math.min(100, baseTraffic(hour, isWeekend(date)) + uniform(rng, -8, 8)));
    return { traffic_index: idx };
}

// ── Visibility ─────────────────────────────────────────────────────

function fogFromTime(hour) {
    if (hour >= 4 && hour < 8) {
        const pf = 1 - Math.abs(hour - 6) / 2;
        return 50 * Math.max(0, pf);
    }
    if (hour >= 8 && hour < 14) return Math.max(0, 25 * (1 - (hour - 8) / 6));
    if (hour >= 20 && hour < 24) return 15 * ((hour - 20) / 4);
    if (hour >= 0 && hour < 4) return 20;
    return 5;
}
function generateVisibility(payload) {
    const baseSeed = payload.base_seed ?? 12345;
    const entityId = payload.entity_id || 'v';
    const tsMs = payload.timestamp_ms ?? 0;
    const isoTs = payload.timestamp || new Date(tsMs).toISOString();
    const date = new Date(isoTs);
    const rng = makeRng(baseSeed, entityId, 'visibility', tsMs);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    let fog = fogFromTime(hour);
    fog = Math.max(0, Math.min(100, fog + uniform(rng, -10, 10)));
    return { fog_index: fog, visibility: fog < 30 ? 'GOOD' : fog < 60 ? 'MEDIUM' : 'POOR' };
}

// ── Tests ──────────────────────────────────────────────────────────

test('streetlight: noon → ~0% dimming, midnight → 100%', () => {
    const noon = generateStreetlight({ base_seed: 1, entity_id: 'l', timestamp_ms: Date.parse('2024-06-15T12:00:00Z'), timestamp: '2024-06-15T12:00:00Z' });
    const mid = generateStreetlight({ base_seed: 1, entity_id: 'l', timestamp_ms: Date.parse('2024-06-15T02:00:00Z'), timestamp: '2024-06-15T02:00:00Z' });
    assert.ok(noon.dimming_level_pct < 10, `noon dim=${noon.dimming_level_pct}`);
    assert.ok(mid.dimming_level_pct > 90, `mid dim=${mid.dimming_level_pct}`);
});

test('streetlight: HIGH-severity event boosts dimming when active in zone', () => {
    const noEvt = generateStreetlight({ base_seed: 1, entity_id: 'l', timestamp_ms: Date.parse('2024-06-15T12:00:00Z'), timestamp: '2024-06-15T12:00:00Z' });
    const evt = generateStreetlight({
        base_seed: 1, entity_id: 'l',
        timestamp_ms: Date.parse('2024-06-15T12:00:00Z'),
        timestamp: '2024-06-15T12:00:00Z',
        active_event: { active: true, severity: 'HIGH', zone_id: 'z' },
    });
    assert.ok(evt.dimming_level_pct > noEvt.dimming_level_pct, `evt=${evt.dimming_level_pct} no=${noEvt.dimming_level_pct}`);
});

test('streetlight: power scales with dimming', () => {
    for (let i = 0; i < 50; i += 1) {
        const ts = Date.parse('2024-06-15T00:00:00Z') + i * 1800_000;
        const r = generateStreetlight({ base_seed: 1, entity_id: 'l', timestamp_ms: ts, timestamp: new Date(ts).toISOString() });
        assert.ok(Math.abs(r.power_w - r.dimming_level_pct) < 1e-6 || r.power_w === (r.dimming_level_pct / 100) * 100);
    }
});

test('traffic: rush-hour > midnight', () => {
    const rush = generateTraffic({ base_seed: 1, entity_id: 't', timestamp_ms: Date.parse('2024-06-17T08:00:00Z'), timestamp: '2024-06-17T08:00:00Z' });
    const night = generateTraffic({ base_seed: 1, entity_id: 't', timestamp_ms: Date.parse('2024-06-17T02:00:00Z'), timestamp: '2024-06-17T02:00:00Z' });
    assert.ok(rush.traffic_index > night.traffic_index, `rush=${rush.traffic_index} night=${night.traffic_index}`);
});

test('traffic: weekend 30% reduction', () => {
    const wd = generateTraffic({ base_seed: 1, entity_id: 't', timestamp_ms: Date.parse('2024-06-17T08:00:00Z'), timestamp: '2024-06-17T08:00:00Z' });
    const we = generateTraffic({ base_seed: 1, entity_id: 't', timestamp_ms: Date.parse('2024-06-15T08:00:00Z'), timestamp: '2024-06-15T08:00:00Z' });
    assert.ok(we.traffic_index < wd.traffic_index, `we=${we.traffic_index} wd=${wd.traffic_index}`);
});

test('traffic: index always in [0, 100]', () => {
    for (let i = 0; i < 200; i += 1) {
        const r = generateTraffic({ base_seed: i, entity_id: 't', timestamp_ms: i * 1e7 });
        assert.ok(r.traffic_index >= 0 && r.traffic_index <= 100);
    }
});

test('visibility: dawn fogs heavier than midday', () => {
    const dawn = generateVisibility({ base_seed: 1, entity_id: 'v', timestamp_ms: Date.parse('2024-06-15T06:00:00Z'), timestamp: '2024-06-15T06:00:00Z' });
    const mid = generateVisibility({ base_seed: 1, entity_id: 'v', timestamp_ms: Date.parse('2024-06-15T15:00:00Z'), timestamp: '2024-06-15T15:00:00Z' });
    assert.ok(dawn.fog_index > mid.fog_index, `dawn=${dawn.fog_index} mid=${mid.fog_index}`);
});

test('visibility: classification follows fog index', () => {
    for (let i = 0; i < 100; i += 1) {
        const r = generateVisibility({ base_seed: i, entity_id: 'v', timestamp_ms: i * 60000 });
        const f = r.fog_index;
        if (f < 30) assert.equal(r.visibility, 'GOOD');
        else if (f < 60) assert.equal(r.visibility, 'MEDIUM');
        else assert.equal(r.visibility, 'POOR');
    }
});

test('determinism: streetlight, traffic, visibility all reproducible', () => {
    const p = { base_seed: 12345, entity_id: 'x', timestamp_ms: Date.parse('2024-06-15T08:00:00Z'), timestamp: '2024-06-15T08:00:00Z' };
    assert.deepEqual(generateStreetlight(p), generateStreetlight(p));
    assert.deepEqual(generateTraffic(p), generateTraffic(p));
    assert.deepEqual(generateVisibility(p), generateVisibility(p));
});
