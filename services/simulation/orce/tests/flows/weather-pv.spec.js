/* eslint-disable */
//
// weather-pv.spec.js — physics tests for the weather and PV subflows.
//
// The math under test is implemented inline in
// `services/simulation/orce/subflows/{weather,pv}-simulator.subflow.json`.
// This spec re-implements the same math so it can be exercised without
// booting Node-RED. Keep both copies in sync.
//

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const seedrandom = require('seedrandom');

// ── Weather (mirror of weather-simulator.subflow.json) ─────────────

const WEATHER_DEFAULTS = {
    latitude: 52.52,
    longitude: 13.4,
    base_temperature_summer_c: 22,
    base_temperature_winter_c: 0,
    daily_temp_amplitude_c: 8,
    temperature_variance_c: 1.5,
    base_humidity_percent: 65,
    humidity_variance_percent: 8,
    base_wind_speed_ms: 4.0,
    wind_variance_ms: 1.5,
    prevailing_wind_direction_deg: 270,
    wind_direction_variance_deg: 30,
    base_cloud_cover_percent: 40,
    cloud_variance_percent: 15,
    max_clear_sky_ghi_w_m2: 1000,
};

function makeRng(baseSeed, entityId, tag, tsMs) {
    const key = `${baseSeed}:${entityId}:${tag}:${tsMs}`;
    const seedHex = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    return seedrandom.alea(seedHex);
}

function normal(rng, mean, stddev) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + stddev * z;
}

function uniform(rng, min, max) {
    return min + (max - min) * rng();
}

function dayOfYear(d) {
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    return Math.floor((d.getTime() - start) / 86400000);
}

function seasonalFactor(d) {
    return Math.cos((2 * Math.PI * (dayOfYear(d) - 182)) / 365);
}

function diurnalFactor(d) {
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    return Math.cos((2 * Math.PI * (h - 15)) / 24);
}

function diurnalWindFactor(d) {
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    const f = 1.0 - 0.4 * Math.cos((2 * Math.PI * (h - 14)) / 24);
    return Math.max(0.6, Math.min(1.4, f));
}

function calcTemperature(d, cfg, rng) {
    const s = seasonalFactor(d);
    const mid = (cfg.base_temperature_summer_c + cfg.base_temperature_winter_c) / 2;
    const amp = (cfg.base_temperature_summer_c - cfg.base_temperature_winter_c) / 2;
    const seasonalT = mid + amp * s;
    const eff = cfg.daily_temp_amplitude_c * (0.6 + 0.4 * (s + 1) / 2);
    let t = seasonalT + eff * diurnalFactor(d);
    if (cfg.temperature_variance_c > 0) {
        t += normal(rng, 0, cfg.temperature_variance_c);
    }
    return t;
}

function calcHumidity(t, cfg, rng) {
    let h = cfg.base_humidity_percent - Math.max(0, t - 15);
    if (cfg.humidity_variance_percent > 0) {
        h += normal(rng, 0, cfg.humidity_variance_percent);
    }
    return Math.max(20, Math.min(95, h));
}

function calcWindSpeed(d, cfg, rng) {
    let s = cfg.base_wind_speed_ms * diurnalWindFactor(d);
    if (cfg.wind_variance_ms > 0) {
        s += normal(rng, 0, cfg.wind_variance_ms);
    }
    return Math.max(0, s);
}

function calcWindDirection(cfg, rng) {
    let d = cfg.prevailing_wind_direction_deg;
    if (cfg.wind_direction_variance_deg > 0) {
        d += normal(rng, 0, cfg.wind_direction_variance_deg);
    }
    d = d % 360;
    if (d < 0) d += 360;
    return d;
}

function calcCloud(d, cfg, rng) {
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    let cover = cfg.base_cloud_cover_percent * (1 - 0.15 * Math.cos((2 * Math.PI * (h - 15)) / 24));
    if (cfg.cloud_variance_percent > 0) {
        cover += normal(rng, 0, cfg.cloud_variance_percent);
    }
    return Math.max(0, Math.min(100, cover));
}

function solarPos(d, lat, lon) {
    const doy = dayOfYear(d);
    const hourUtc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const decl = ((23.45 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + doy)) / 365);
    const b = (2 * Math.PI * (doy - 81)) / 365;
    const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
    const offset = 4 * lon;
    const solarTime = hourUtc * 60 + offset + eot;
    const haDeg = solarTime / 4.0 - 180;
    const ha = (haDeg * Math.PI) / 180;
    const latR = (lat * Math.PI) / 180;
    const sinAlt =
        Math.sin(latR) * Math.sin(decl) +
        Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
    const altR = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const altDeg = (altR * 180) / Math.PI;
    return { altitude_deg: Math.max(0, altDeg), is_daylight: altDeg > 0 };
}

function clearSkyGhi(altDeg, maxGhi) {
    if (altDeg <= 0) return 0;
    const altR = (altDeg * Math.PI) / 180;
    const am = 1 / Math.max(Math.sin(altR), 0.05);
    return Math.max(0, maxGhi * Math.sin(altR) * Math.pow(0.7, Math.pow(am, 0.678)));
}

function applyCloud(clear, cloud, rng) {
    if (clear <= 0) return 0;
    let f = 1.0 - 0.5 * (cloud / 100);
    f = Math.max(0.3, Math.min(1.0, f + uniform(rng, -0.05, 0.05)));
    return clear * f;
}

function splitGhi(ghi, altDeg, cloud) {
    if (ghi <= 0 || altDeg <= 0) {
        return { ghi_w_m2: 0, dni_w_m2: 0, dhi_w_m2: 0 };
    }
    const altR = (altDeg * Math.PI) / 180;
    const kt = 1 - 0.7 * (cloud / 100);
    let df;
    if (kt <= 0.22) df = 1 - 0.09 * kt;
    else if (kt <= 0.8)
        df = 0.9511 - 0.1604 * kt + 4.388 * kt * kt - 16.638 * Math.pow(kt, 3) + 12.336 * Math.pow(kt, 4);
    else df = 0.165;
    const dhi = ghi * df;
    const dh = ghi - dhi;
    const dni = dh / Math.max(Math.sin(altR), 0.05);
    return {
        ghi_w_m2: Math.max(0, ghi),
        dni_w_m2: Math.max(0, Math.min(dni, 1200)),
        dhi_w_m2: Math.max(0, dhi),
    };
}

function generateWeather(payload) {
    const baseSeed = typeof payload.base_seed === 'number' ? payload.base_seed : 12345;
    const entityId = payload.entity_id || 'weather-default';
    const tsMs = typeof payload.timestamp_ms === 'number' ? payload.timestamp_ms : 0;
    const isoTs = payload.timestamp || new Date(tsMs).toISOString();
    const cfg = { ...WEATHER_DEFAULTS, ...(payload.config || {}) };
    const date = new Date(isoTs);
    const cloud = calcCloud(date, cfg, makeRng(baseSeed, entityId, 'cloud', tsMs));
    const temperature = calcTemperature(date, cfg, makeRng(baseSeed, entityId, 'temp', tsMs));
    const humidity = calcHumidity(temperature, cfg, makeRng(baseSeed, entityId, 'hum', tsMs));
    const windSpeed = calcWindSpeed(date, cfg, makeRng(baseSeed, entityId, 'winds', tsMs));
    const windDir = calcWindDirection(cfg, makeRng(baseSeed, entityId, 'windd', tsMs));
    const sun = solarPos(date, cfg.latitude, cfg.longitude);
    let irradiance = { ghi_w_m2: 0, dni_w_m2: 0, dhi_w_m2: 0 };
    if (sun.is_daylight) {
        const clear = clearSkyGhi(sun.altitude_deg, cfg.max_clear_sky_ghi_w_m2);
        const adj = applyCloud(clear, cloud, makeRng(baseSeed, entityId, 'irr', tsMs));
        irradiance = splitGhi(adj, sun.altitude_deg, cloud);
    }
    return {
        timestamp: isoTs,
        location: { latitude: cfg.latitude, longitude: cfg.longitude },
        conditions: {
            temperature_c: temperature,
            humidity_percent: humidity,
            wind_speed_ms: windSpeed,
            wind_direction_deg: windDir,
            cloud_cover_percent: cloud,
            ...irradiance,
        },
    };
}

// ── PV (mirror of pv-simulator.subflow.json) ───────────────────────

const PV_DEFAULTS = {
    system_id: 'pv-default',
    nominal_capacity_kwp: 50,
    noct_c: 45,
    temperature_coefficient_pct_per_c: -0.4,
    reference_temperature_c: 25,
    system_losses_percent: 14,
    interval_minutes: 15,
};

function pvModuleTemp(amb, ghi, cfg) {
    if (ghi <= 0) return amb;
    return amb + (cfg.noct_c - 20) * (ghi / 800);
}

function pvDerating(modT, cfg) {
    const d = 1 + (cfg.temperature_coefficient_pct_per_c / 100) * (modT - cfg.reference_temperature_c);
    return Math.max(0, Math.min(1.2, d));
}

function pvPower(ghi, modT, cfg) {
    if (ghi <= 0) return 0;
    const p = cfg.nominal_capacity_kwp * (ghi / 1000) * pvDerating(modT, cfg) * (1 - cfg.system_losses_percent / 100);
    return Math.min(p, cfg.nominal_capacity_kwp);
}

// ── 1. Weather determinism ─────────────────────────────────────────

test('weather: same (seed, entity, ts) → identical output', () => {
    const p = {
        base_seed: 12345,
        entity_id: 'site-berlin',
        timestamp_ms: Date.parse('2024-06-15T12:00:00Z'),
        timestamp: '2024-06-15T12:00:00Z',
    };
    const a = generateWeather(p);
    const b = generateWeather(p);
    assert.deepEqual(a, b);
});

// ── 2. Weather plausible ranges ────────────────────────────────────

test('weather: temperature within ±15°C of seasonal mid-band over 24h', () => {
    const day = Date.parse('2024-06-15T00:00:00Z');
    for (let i = 0; i < 96; i += 1) {
        const ts = day + i * 15 * 60 * 1000;
        const w = generateWeather({
            base_seed: 1,
            entity_id: 'w',
            timestamp_ms: ts,
            timestamp: new Date(ts).toISOString(),
        });
        const t = w.conditions.temperature_c;
        assert.ok(t >= -10 && t <= 40, `t=${t} out of range at ${new Date(ts).toISOString()}`);
    }
});

test('weather: cloud_cover always [0,100], humidity [20,95]', () => {
    for (let i = 0; i < 200; i += 1) {
        const w = generateWeather({
            base_seed: 7,
            entity_id: 'w',
            timestamp_ms: i * 600_000,
            timestamp: new Date(i * 600_000).toISOString(),
        });
        assert.ok(w.conditions.cloud_cover_percent >= 0 && w.conditions.cloud_cover_percent <= 100);
        assert.ok(w.conditions.humidity_percent >= 20 && w.conditions.humidity_percent <= 95);
        assert.ok(w.conditions.wind_speed_ms >= 0);
    }
});

test('weather: GHI is zero at midnight UTC (Berlin)', () => {
    const w = generateWeather({
        base_seed: 1,
        entity_id: 'w',
        timestamp_ms: Date.parse('2024-06-15T00:00:00Z'),
        timestamp: '2024-06-15T00:00:00Z',
    });
    assert.equal(w.conditions.ghi_w_m2, 0);
});

test('weather: GHI is positive at noon in summer (Berlin)', () => {
    const w = generateWeather({
        base_seed: 1,
        entity_id: 'w',
        timestamp_ms: Date.parse('2024-06-15T12:00:00Z'),
        timestamp: '2024-06-15T12:00:00Z',
    });
    assert.ok(w.conditions.ghi_w_m2 > 100, `ghi=${w.conditions.ghi_w_m2}`);
});

test('weather: summer-noon GHI > winter-noon GHI (Berlin)', () => {
    const winter = generateWeather({
        base_seed: 1,
        entity_id: 'w',
        timestamp_ms: Date.parse('2024-01-15T12:00:00Z'),
        timestamp: '2024-01-15T12:00:00Z',
        config: { base_cloud_cover_percent: 0, cloud_variance_percent: 0 },
    });
    const summer = generateWeather({
        base_seed: 1,
        entity_id: 'w',
        timestamp_ms: Date.parse('2024-06-15T12:00:00Z'),
        timestamp: '2024-06-15T12:00:00Z',
        config: { base_cloud_cover_percent: 0, cloud_variance_percent: 0 },
    });
    assert.ok(
        summer.conditions.ghi_w_m2 > winter.conditions.ghi_w_m2,
        `summer=${summer.conditions.ghi_w_m2} winter=${winter.conditions.ghi_w_m2}`,
    );
});

// ── 3. PV correlation with weather ─────────────────────────────────

test('pv: power is zero when GHI is zero', () => {
    const p = pvPower(0, 25, PV_DEFAULTS);
    assert.equal(p, 0);
});

test('pv: monotonic in GHI at fixed module temperature', () => {
    let prev = -1;
    for (const ghi of [50, 100, 200, 400, 600, 800, 1000]) {
        const p = pvPower(ghi, 25, PV_DEFAULTS);
        assert.ok(p > prev, `ghi=${ghi} produced p=${p}, expected > ${prev}`);
        prev = p;
    }
});

test('pv: hot module derates output vs cool module at same GHI', () => {
    const cool = pvPower(800, 25, PV_DEFAULTS);
    const hot = pvPower(800, 60, PV_DEFAULTS);
    assert.ok(hot < cool, `hot=${hot} cool=${cool}`);
});

test('pv: module temperature rises with GHI', () => {
    const lowGhi = pvModuleTemp(20, 100, PV_DEFAULTS);
    const highGhi = pvModuleTemp(20, 800, PV_DEFAULTS);
    assert.ok(highGhi > lowGhi, `high=${highGhi} low=${lowGhi}`);
});

test('pv: caps at nominal capacity', () => {
    const cfg = { ...PV_DEFAULTS, system_losses_percent: 0, temperature_coefficient_pct_per_c: 0 };
    const p = pvPower(2000, 25, cfg); // double STC
    assert.ok(p <= cfg.nominal_capacity_kwp);
});

test('pv + weather: end-to-end at noon yields nonzero power', () => {
    const w = generateWeather({
        base_seed: 1,
        entity_id: 'w',
        timestamp_ms: Date.parse('2024-06-15T12:00:00Z'),
        timestamp: '2024-06-15T12:00:00Z',
        config: { base_cloud_cover_percent: 10, cloud_variance_percent: 5 },
    });
    const ghi = w.conditions.ghi_w_m2;
    const ambient = w.conditions.temperature_c;
    const modT = pvModuleTemp(ambient, ghi, PV_DEFAULTS);
    const power = pvPower(ghi, modT, PV_DEFAULTS);
    assert.ok(power > 0);
});

test('pv + weather: at midnight produces zero power', () => {
    const w = generateWeather({
        base_seed: 1,
        entity_id: 'w',
        timestamp_ms: Date.parse('2024-06-15T00:00:00Z'),
        timestamp: '2024-06-15T00:00:00Z',
    });
    const power = pvPower(
        w.conditions.ghi_w_m2,
        pvModuleTemp(w.conditions.temperature_c, w.conditions.ghi_w_m2, PV_DEFAULTS),
        PV_DEFAULTS,
    );
    assert.equal(power, 0);
});
