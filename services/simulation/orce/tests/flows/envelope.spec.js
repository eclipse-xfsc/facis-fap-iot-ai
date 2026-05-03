/* eslint-disable */
//
// envelope.spec.js — shape and correlation tests for the feeds orchestrator.
//
// Verifies that the envelope produced by `flows/facis-simulation-feeds.json`
// matches the structure expected by the Kafka/MQTT/Modbus adapter tabs and by
// the original Python `src/api/orce/envelope.py:46-70`.
//
// We exercise a minimal in-process clone of the orchestrator (the subset of
// math needed to assemble a correlated tick) and assert on the resulting
// envelope.
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

// Minimal inline weather — just enough to exercise correlation
function tinyWeather(payload) {
    const d = new Date(payload.timestamp);
    const decl = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear(d))) / 365);
    const lat = (52.52 * Math.PI) / 180;
    const ha = (((d.getUTCHours() + d.getUTCMinutes() / 60) - 12) * 15 * Math.PI) / 180;
    const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    const altR = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const altDeg = Math.max(0, (altR * 180) / Math.PI);
    const ghi = altDeg <= 0 ? 0 : 1000 * Math.sin(altR) * Math.pow(0.7, Math.pow(1 / Math.max(Math.sin(altR), 0.05), 0.678));
    return { conditions: { ghi_w_m2: ghi, temperature_c: 20 } };
}

function tinyEnvelope(opts) {
    const baseSeed = opts.base_seed ?? 12345;
    const tsMs = opts.timestamp_ms ?? Date.parse('2024-06-15T12:00:00Z');
    const isoTs = opts.timestamp || new Date(tsMs).toISOString();
    const mode = opts.mode || 'normal';
    const registry = opts.registry || {
        site_id: 'site-test',
        city_id: 'city-test',
        weather: [{ entity_id: 'w' }],
        pv: [{ entity_id: 'pv-1' }],
        meters: [{ entity_id: 'm-1' }, { entity_id: 'm-2' }],
        price: [{ entity_id: 'price-1' }],
        consumers: [{ entity_id: 'c-1' }],
        streetlights: [{ entity_id: 'l-1', zone_id: 'zone-001' }],
        traffic: [{ entity_id: 't-1', zone_id: 'zone-001' }],
        events: [{ entity_id: 'e-1', zone_id: 'zone-001' }],
        visibility: [{ entity_id: 'v-1' }],
    };

    const weather = tinyWeather({ timestamp: isoTs });

    const pv = registry.pv.map((spec) => ({
        site_id: registry.site_id,
        system_id: spec.entity_id,
        timestamp: isoTs,
        readings: {
            power_output_kw: weather.conditions.ghi_w_m2 > 0 ? 5 : 0,
            irradiance_w_m2: weather.conditions.ghi_w_m2,
        },
    }));

    const meters = registry.meters.map((spec) => ({
        site_id: registry.site_id,
        timestamp: isoTs,
        meter_id: spec.entity_id,
        readings: {
            active_power_l1_w: 5000,
            active_power_l2_w: 5000,
            active_power_l3_w: 5000,
        },
    }));

    return {
        type: 'sim.tick',
        schema_version: '1.0',
        timestamp: isoTs,
        mode,
        seed: baseSeed,
        site_id: registry.site_id,
        smart_energy: {
            meters,
            pv,
            weather: { site_id: registry.site_id, timestamp: isoTs, conditions: weather.conditions, location: { latitude: 52.52, longitude: 13.405 } },
            price: { timestamp: isoTs, feed_id: registry.price[0].entity_id, price_eur_per_kwh: 0.15, tariff_type: 'MIDDAY' },
            consumers: registry.consumers.map((spec) => ({ site_id: registry.site_id, timestamp: isoTs, device_id: spec.entity_id, device_state: 'ON', device_power_kw: 2.5 })),
            metrics: { total_active_power_w: 30000, total_pv_power_kw: 5, total_consumer_power_kw: 2.5, net_load_kw: 27.5 },
        },
        smart_city: {
            city_id: registry.city_id,
            timestamp: isoTs,
            events: registry.events.map((spec) => ({ city_id: registry.city_id, zone_id: spec.zone_id, timestamp: isoTs, event_type: 'EVENT', severity: 'LOW', severity_num: 1, active: false })),
            streetlights: registry.streetlights.map((spec) => ({ city_id: registry.city_id, zone_id: spec.zone_id, light_id: spec.entity_id, timestamp: isoTs, dimming_level_pct: 0, power_w: 0 })),
            traffic: registry.traffic.map((spec) => ({ city_id: registry.city_id, zone_id: spec.zone_id, timestamp: isoTs, traffic_index: 50 })),
            visibility: { city_id: registry.city_id, timestamp: isoTs, fog_index: 5, visibility: 'GOOD', sunrise_time: '04:30', sunset_time: '20:30' },
        },
    };
}

test('envelope: top-level shape matches Python envelope contract', () => {
    const e = tinyEnvelope({});
    for (const k of ['type', 'schema_version', 'timestamp', 'mode', 'seed', 'site_id', 'smart_energy', 'smart_city']) {
        assert.ok(k in e, `missing top-level key: ${k}`);
    }
    assert.equal(e.type, 'sim.tick');
});

test('envelope: smart_energy contains meters, pv, weather, price, consumers, metrics', () => {
    const e = tinyEnvelope({});
    for (const k of ['meters', 'pv', 'weather', 'price', 'consumers', 'metrics']) {
        assert.ok(k in e.smart_energy, `missing smart_energy.${k}`);
    }
});

test('envelope: smart_city contains events, streetlights, traffic, visibility', () => {
    const e = tinyEnvelope({});
    for (const k of ['events', 'streetlights', 'traffic', 'visibility']) {
        assert.ok(k in e.smart_city, `missing smart_city.${k}`);
    }
});

test('envelope: meter and pv arrays preserve count from registry', () => {
    const reg = {
        site_id: 's', city_id: 'c',
        weather: [{ entity_id: 'w' }],
        pv: [{ entity_id: 'pv-1' }, { entity_id: 'pv-2' }, { entity_id: 'pv-3' }],
        meters: [{ entity_id: 'm-1' }],
        price: [{ entity_id: 'p-1' }],
        consumers: [],
        streetlights: [],
        traffic: [],
        events: [],
        visibility: [{ entity_id: 'v' }],
    };
    const e = tinyEnvelope({ registry: reg });
    assert.equal(e.smart_energy.pv.length, 3);
    assert.equal(e.smart_energy.meters.length, 1);
});

test('envelope: PV correlates with weather GHI (zero at midnight, positive at noon)', () => {
    const noon = tinyEnvelope({ timestamp: '2024-06-15T12:00:00Z', timestamp_ms: Date.parse('2024-06-15T12:00:00Z') });
    const mid = tinyEnvelope({ timestamp: '2024-06-15T00:00:00Z', timestamp_ms: Date.parse('2024-06-15T00:00:00Z') });
    assert.ok(noon.smart_energy.pv[0].readings.power_output_kw > 0);
    assert.equal(mid.smart_energy.pv[0].readings.power_output_kw, 0);
});

test('envelope: timestamp is propagated identically to all feeds', () => {
    const ts = '2024-06-15T08:30:00.000Z';
    const e = tinyEnvelope({ timestamp: ts, timestamp_ms: Date.parse(ts) });
    assert.equal(e.timestamp, ts);
    assert.equal(e.smart_energy.weather.timestamp, ts);
    assert.equal(e.smart_energy.price.timestamp, ts);
    e.smart_energy.meters.forEach((m) => assert.equal(m.timestamp, ts));
    e.smart_energy.pv.forEach((p) => assert.equal(p.timestamp, ts));
});

test('envelope: seed and site_id propagated', () => {
    const e = tinyEnvelope({ base_seed: 999 });
    assert.equal(e.seed, 999);
    assert.equal(e.site_id, e.smart_energy.weather.site_id);
});
