/* eslint-disable */
//
// mqtt-split.spec.js — verifies the per-feed split logic in the
// MQTT adapter (`flows/facis-simulation-mqtt.json`). Mirrors the function-node
// `split-feeds-mqtt` body.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function splitFeedsMqtt(envelope) {
    const ts = envelope.timestamp;
    const siteId = envelope.site_id;
    const cityId = envelope.smart_city.city_id || 'city';
    const msgs = [];
    const emit = (topic, payload, qos, retain) => msgs.push({ topic, payload: JSON.stringify(payload), qos, retain });
    for (const m of (envelope.smart_energy.meters || [])) {
        emit(`facis/${siteId}/meter/${m.meter_id || 'unknown'}`, m, 1, false);
    }
    for (const p of (envelope.smart_energy.pv || [])) {
        const id = p.system_id || p.pv_system_id || 'unknown';
        emit(`facis/${siteId}/pv/${id}`, p, 1, false);
    }
    if (envelope.smart_energy.weather) emit(`facis/${siteId}/weather/current`, envelope.smart_energy.weather, 0, true);
    if (envelope.smart_energy.price) emit(`facis/${siteId}/prices/spot`, envelope.smart_energy.price, 1, true);
    for (const c of (envelope.smart_energy.consumers || [])) {
        emit(`facis/${siteId}/loads/${c.device_type || 'device'}`, c, 0, false);
    }
    for (const l of (envelope.smart_city.streetlights || [])) {
        emit(`facis/${cityId}/light/${l.zone_id || 'zone'}/${l.light_id || 'light'}`, l, 0, false);
    }
    for (const t of (envelope.smart_city.traffic || [])) {
        emit(`facis/${cityId}/traffic/${t.zone_id || 'zone'}`, t, 0, false);
    }
    for (const e of (envelope.smart_city.events || [])) {
        emit(`facis/${cityId}/event/${e.zone_id || 'zone'}`, e, 1, false);
    }
    if (envelope.smart_city.visibility) emit(`facis/${cityId}/weather`, envelope.smart_city.visibility, 0, true);
    msgs.push({ topic: `facis/${siteId}/simulation/status`, payload: JSON.stringify({ timestamp: ts, last_seed: envelope.seed, mode: envelope.mode }), qos: 1, retain: true });
    return msgs;
}

const ENV = {
    type: 'sim.tick', schema_version: '1.0', timestamp: '2024-06-15T12:00:00Z', mode: 'normal', seed: 42, site_id: 'site-berlin',
    smart_energy: {
        meters: [{ meter_id: 'm1' }, { meter_id: 'm2' }],
        pv: [{ system_id: 'pv1' }],
        weather: { conditions: { ghi_w_m2: 500 } },
        price: { price_eur_per_kwh: 0.15 },
        consumers: [{ device_id: 'c1', device_type: 'oven' }],
    },
    smart_city: {
        city_id: 'city-berlin',
        streetlights: [{ light_id: 'l1', zone_id: 'z1' }],
        traffic: [{ zone_id: 'z1' }],
        events: [{ zone_id: 'z1', active: false }],
        visibility: { fog_index: 5 },
    },
};

test('mqtt: meter topic and QoS=1, not retained', () => {
    const out = splitFeedsMqtt(ENV);
    const meters = out.filter((m) => m.topic.startsWith('facis/site-berlin/meter/'));
    assert.equal(meters.length, 2);
    meters.forEach((m) => { assert.equal(m.qos, 1); assert.equal(m.retain, false); });
});

test('mqtt: weather/current is QoS 0 retained', () => {
    const out = splitFeedsMqtt(ENV);
    const w = out.find((m) => m.topic === 'facis/site-berlin/weather/current');
    assert.ok(w);
    assert.equal(w.qos, 0);
    assert.equal(w.retain, true);
});

test('mqtt: prices/spot is QoS 1 retained', () => {
    const out = splitFeedsMqtt(ENV);
    const p = out.find((m) => m.topic === 'facis/site-berlin/prices/spot');
    assert.equal(p.qos, 1);
    assert.equal(p.retain, true);
});

test('mqtt: loads topic uses device_type slug', () => {
    const out = splitFeedsMqtt(ENV);
    const load = out.find((m) => m.topic.startsWith('facis/site-berlin/loads/'));
    assert.equal(load.topic, 'facis/site-berlin/loads/oven');
});

test('mqtt: status topic is retained', () => {
    const out = splitFeedsMqtt(ENV);
    const s = out.find((m) => m.topic === 'facis/site-berlin/simulation/status');
    assert.ok(s);
    assert.equal(s.retain, true);
    const body = JSON.parse(s.payload);
    assert.equal(body.last_seed, 42);
    assert.equal(body.mode, 'normal');
});

test('mqtt: streetlight topic includes zone and light', () => {
    const out = splitFeedsMqtt(ENV);
    const l = out.find((m) => m.topic.startsWith('facis/city-berlin/light/'));
    assert.equal(l.topic, 'facis/city-berlin/light/z1/l1');
});
