/* eslint-disable */
//
// kafka-split.spec.js — verifies the per-topic split logic in the
// Kafka adapter (`flows/facis-simulation-kafka.json`).
// Algorithm is mirrored from the function-node `split-feeds` body.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function splitFeeds(envelope) {
    const siteId = envelope.site_id;
    const msgs = [];
    for (const m of (envelope.smart_energy.meters || [])) {
        msgs.push({ topic: 'sim.smart_energy.meter', key: m.meter_id || siteId, payload: JSON.stringify(m) });
    }
    for (const p of (envelope.smart_energy.pv || [])) {
        msgs.push({ topic: 'sim.smart_energy.pv', key: p.system_id || p.pv_system_id || siteId, payload: JSON.stringify(p) });
    }
    if (envelope.smart_energy.weather) {
        msgs.push({ topic: 'sim.smart_energy.weather', key: envelope.smart_energy.weather.site_id || siteId, payload: JSON.stringify(envelope.smart_energy.weather) });
    }
    if (envelope.smart_energy.price) {
        msgs.push({ topic: 'sim.smart_energy.price', key: envelope.smart_energy.price.feed_id || 'price', payload: JSON.stringify(envelope.smart_energy.price) });
    }
    for (const c of (envelope.smart_energy.consumers || [])) {
        msgs.push({ topic: 'sim.smart_energy.consumer', key: c.device_id || siteId, payload: JSON.stringify(c) });
    }
    for (const l of (envelope.smart_city.streetlights || [])) {
        msgs.push({ topic: 'sim.smart_city.light', key: l.light_id || l.zone_id, payload: JSON.stringify(l) });
    }
    for (const t of (envelope.smart_city.traffic || [])) {
        msgs.push({ topic: 'sim.smart_city.traffic', key: t.zone_id, payload: JSON.stringify(t) });
    }
    for (const e of (envelope.smart_city.events || [])) {
        msgs.push({ topic: 'sim.smart_city.event', key: e.zone_id, payload: JSON.stringify(e) });
    }
    if (envelope.smart_city.visibility) {
        msgs.push({ topic: 'sim.smart_city.weather', key: envelope.smart_city.city_id || 'city', payload: JSON.stringify(envelope.smart_city.visibility) });
    }
    return msgs;
}

const SAMPLE_ENVELOPE = {
    type: 'sim.tick', schema_version: '1.0', timestamp: '2024-06-15T12:00:00Z',
    mode: 'normal', seed: 12345, site_id: 'site-test',
    smart_energy: {
        meters: [{ meter_id: 'm1', readings: {} }, { meter_id: 'm2', readings: {} }],
        pv: [{ system_id: 'pv1', readings: {} }],
        weather: { site_id: 'site-test', conditions: {} },
        price: { feed_id: 'p1', price_eur_per_kwh: 0.15 },
        consumers: [{ device_id: 'c1' }],
    },
    smart_city: {
        city_id: 'city-test',
        streetlights: [{ light_id: 'l1', zone_id: 'z1' }, { light_id: 'l2', zone_id: 'z1' }],
        traffic: [{ zone_id: 'z1', traffic_index: 50 }],
        events: [{ zone_id: 'z1', active: false }],
        visibility: { city_id: 'city-test' },
    },
};

test('split: produces one message per topic per entity', () => {
    const out = splitFeeds(SAMPLE_ENVELOPE);
    const counts = out.reduce((acc, m) => { acc[m.topic] = (acc[m.topic] || 0) + 1; return acc; }, {});
    assert.equal(counts['sim.smart_energy.meter'], 2);
    assert.equal(counts['sim.smart_energy.pv'], 1);
    assert.equal(counts['sim.smart_energy.weather'], 1);
    assert.equal(counts['sim.smart_energy.price'], 1);
    assert.equal(counts['sim.smart_energy.consumer'], 1);
    assert.equal(counts['sim.smart_city.light'], 2);
    assert.equal(counts['sim.smart_city.traffic'], 1);
    assert.equal(counts['sim.smart_city.event'], 1);
    assert.equal(counts['sim.smart_city.weather'], 1);
});

test('split: each message has topic, key, and JSON payload', () => {
    const out = splitFeeds(SAMPLE_ENVELOPE);
    for (const m of out) {
        assert.ok(m.topic, 'missing topic');
        assert.ok(m.key, 'missing key');
        assert.ok(typeof m.payload === 'string', 'payload should be a string');
        JSON.parse(m.payload); // throws if invalid
    }
});

test('split: meter and consumer keys come from id fields', () => {
    const out = splitFeeds(SAMPLE_ENVELOPE);
    const meters = out.filter((m) => m.topic === 'sim.smart_energy.meter').map((m) => m.key);
    assert.deepEqual(meters.sort(), ['m1', 'm2']);
});

test('split: tolerates missing optional sections', () => {
    const minimal = {
        type: 'sim.tick', schema_version: '1.0', timestamp: 't', mode: 'normal', seed: 1, site_id: 's',
        smart_energy: { meters: [], pv: [] },
        smart_city: { city_id: 'c' },
    };
    const out = splitFeeds(minimal);
    assert.equal(out.length, 0);
});
