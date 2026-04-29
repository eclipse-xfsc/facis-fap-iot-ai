"use strict";

function parseBody(payload) {
    if (typeof payload === "string") {
        try {
            return { ok: true, value: JSON.parse(payload) };
        } catch {
            return { ok: false, detail: "Request body must be valid JSON" };
        }
    }
    return { ok: true, value: payload };
}

function validateWindow(asObj) {
    const startTs = new Date(asObj.start_ts);
    const endTs = new Date(asObj.end_ts);
    if (Number.isNaN(startTs.getTime()) || Number.isNaN(endTs.getTime())) {
        return { ok: false, detail: "start_ts and end_ts must be valid timestamps" };
    }
    if (startTs >= endTs) {
        return { ok: false, detail: "start_ts must be earlier than end_ts" };
    }
    return { ok: true, startTs, endTs };
}

function ensureObject(asObj) {
    if (!asObj || typeof asObj !== "object" || Array.isArray(asObj)) {
        return { ok: false, detail: "Request body must be a JSON object" };
    }
    return { ok: true };
}

function validateAnomalyRequest(payload) {
    const parsed = parseBody(payload);
    if (!parsed.ok) return { ok: false, statusCode: 400, detail: parsed.detail };
    const asObj = parsed.value;
    const objectCheck = ensureObject(asObj);
    if (!objectCheck.ok) return { ok: false, statusCode: 400, detail: objectCheck.detail };
    const win = validateWindow(asObj);
    if (!win.ok) return { ok: false, statusCode: 400, detail: win.detail };

    const threshold = asObj.robust_z_threshold === undefined ? 3.5 : Number(asObj.robust_z_threshold);
    if (!Number.isFinite(threshold) || threshold <= 0) {
        return { ok: false, statusCode: 400, detail: "robust_z_threshold must be greater than zero" };
    }

    return {
        ok: true,
        value: {
            start_ts: win.startTs.toISOString(),
            end_ts: win.endTs.toISOString(),
            timezone: typeof asObj.timezone === "string" && asObj.timezone ? asObj.timezone : "UTC",
            robust_z_threshold: threshold,
            include_data: !!asObj.include_data,
        },
    };
}

function validateEnergyRequest(payload) {
    const parsed = parseBody(payload);
    if (!parsed.ok) return { ok: false, statusCode: 400, detail: parsed.detail };
    const asObj = parsed.value;
    const objectCheck = ensureObject(asObj);
    if (!objectCheck.ok) return { ok: false, statusCode: 400, detail: objectCheck.detail };
    const win = validateWindow(asObj);
    if (!win.ok) return { ok: false, statusCode: 400, detail: win.detail };

    const forecastAlpha = asObj.forecast_alpha === undefined ? 0.6 : Number(asObj.forecast_alpha);
    if (!Number.isFinite(forecastAlpha) || forecastAlpha <= 0 || forecastAlpha > 1) {
        return { ok: false, statusCode: 400, detail: "forecast_alpha must be within (0, 1]" };
    }

    const trendEpsilon = asObj.trend_epsilon === undefined ? 0.02 : Number(asObj.trend_epsilon);
    if (!Number.isFinite(trendEpsilon) || trendEpsilon < 0) {
        return { ok: false, statusCode: 400, detail: "trend_epsilon must be >= 0" };
    }

    const strategy =
        asObj.daily_overview_strategy === undefined ? "strict_daily" : String(asObj.daily_overview_strategy);
    if (!["strict_daily", "fallback_hourly"].includes(strategy)) {
        return {
            ok: false,
            statusCode: 400,
            detail: "daily_overview_strategy must be strict_daily or fallback_hourly",
        };
    }

    return {
        ok: true,
        value: {
            start_ts: win.startTs.toISOString(),
            end_ts: win.endTs.toISOString(),
            timezone: typeof asObj.timezone === "string" && asObj.timezone ? asObj.timezone : "UTC",
            forecast_alpha: forecastAlpha,
            trend_epsilon: trendEpsilon,
            daily_overview_strategy: strategy,
            include_data: !!asObj.include_data,
        },
    };
}

function validateCityRequest(payload) {
    const parsed = parseBody(payload);
    if (!parsed.ok) return { ok: false, statusCode: 400, detail: parsed.detail };
    const asObj = parsed.value;
    const objectCheck = ensureObject(asObj);
    if (!objectCheck.ok) return { ok: false, statusCode: 400, detail: objectCheck.detail };
    const win = validateWindow(asObj);
    if (!win.ok) return { ok: false, statusCode: 400, detail: win.detail };

    return {
        ok: true,
        value: {
            start_ts: win.startTs.toISOString(),
            end_ts: win.endTs.toISOString(),
            timezone: typeof asObj.timezone === "string" && asObj.timezone ? asObj.timezone : "UTC",
            include_data: !!asObj.include_data,
        },
    };
}

module.exports = {
    validateAnomalyRequest,
    validateEnergyRequest,
    validateCityRequest,
};
