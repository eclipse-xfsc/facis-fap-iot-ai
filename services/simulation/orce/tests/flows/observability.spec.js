/* eslint-disable */
//
// observability.spec.js — Prometheus text format and counter increment
// logic from `flows/facis-simulation-observability.json`.
//

const test = require('node:test');
const assert = require('node:assert/strict');

function increment(globalCtx, family, label, value = 1) {
    const m = globalCtx.metrics || {};
    if (!m[family]) m[family] = {};
    m[family][label] = (m[family][label] || 0) + value;
    globalCtx.metrics = m;
}

function buildMetricsBody(globalCtx, flowCtx) {
    const counters = globalCtx.metrics || {};
    const tickCount = (flowCtx.kafka_tick_count || 0) + (flowCtx.mqtt_tick_count || 0);
    const fmt = (name, help, type, samples) => {
        let out = `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n`;
        for (const [labels, value] of samples) {
            const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
            out += `${name}${labelStr ? `{${labelStr}}` : ''} ${value}\n`;
        }
        return out;
    };
    let body = '';
    body += fmt('facis_sim_ticks_total', 'Total simulation ticks emitted', 'counter', [
        [{ runtime: 'orce-native' }, tickCount],
    ]);
    const kafkaTotals = counters.kafka_messages_sent_total || {};
    body += fmt('facis_kafka_messages_sent_total', 'Total Kafka messages sent', 'counter',
        Object.entries(kafkaTotals).map(([topic, v]) => [{ topic }, v]));
    const mqttTotals = counters.mqtt_messages_sent_total || {};
    body += fmt('facis_mqtt_messages_sent_total', 'Total MQTT messages sent', 'counter',
        Object.entries(mqttTotals).map(([topic, v]) => [{ topic }, v]));
    const modbusTotals = counters.modbus_requests_total || {};
    body += fmt('facis_modbus_requests_total', 'Total Modbus requests served', 'counter',
        Object.entries(modbusTotals).map(([fc, v]) => [{ register_type: fc }, v]));
    return body;
}

test('metric counters: increment accumulates per (family, label)', () => {
    const g = {};
    increment(g, 'kafka_messages_sent_total', 'sim.smart_energy.meter');
    increment(g, 'kafka_messages_sent_total', 'sim.smart_energy.meter');
    increment(g, 'kafka_messages_sent_total', 'sim.smart_energy.pv');
    assert.equal(g.metrics.kafka_messages_sent_total['sim.smart_energy.meter'], 2);
    assert.equal(g.metrics.kafka_messages_sent_total['sim.smart_energy.pv'], 1);
});

test('metric body: includes all four counter families with HELP/TYPE headers', () => {
    const g = { metrics: {
        kafka_messages_sent_total: { 'sim.smart_energy.meter': 10 },
        mqtt_messages_sent_total: { 'facis/site/meter/m1': 7 },
        modbus_requests_total: { FC3: 3 },
    } };
    const f = { kafka_tick_count: 5, mqtt_tick_count: 5 };
    const body = buildMetricsBody(g, f);

    for (const name of [
        'facis_sim_ticks_total',
        'facis_kafka_messages_sent_total',
        'facis_mqtt_messages_sent_total',
        'facis_modbus_requests_total',
    ]) {
        assert.match(body, new RegExp(`# HELP ${name}`), `missing HELP for ${name}`);
        assert.match(body, new RegExp(`# TYPE ${name} counter`), `missing TYPE for ${name}`);
    }
    assert.match(body, /facis_sim_ticks_total\{runtime="orce-native"\} 10/);
    assert.match(body, /facis_kafka_messages_sent_total\{topic="sim\.smart_energy\.meter"\} 10/);
    assert.match(body, /facis_mqtt_messages_sent_total\{topic="facis\/site\/meter\/m1"\} 7/);
});

test('metric body: empty counters still emit ticks_total', () => {
    const body = buildMetricsBody({}, {});
    assert.match(body, /facis_sim_ticks_total\{runtime="orce-native"\} 0/);
});
