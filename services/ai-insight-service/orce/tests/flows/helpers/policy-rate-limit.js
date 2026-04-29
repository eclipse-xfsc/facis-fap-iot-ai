"use strict";

function toBool(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    const lowered = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "off"].includes(lowered)) return false;
    return fallback;
}

function parseList(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
        // ignore and use fallback
    }
    return fallback;
}

function evaluatePolicyAndRateLimit({ headers = {}, env = {}, buckets = {}, nowMs = Date.now() }) {
    const pickHeader = (name) => headers[String(name || "").toLowerCase()];

    const policyEnabled = toBool(env.AI_INSIGHT_POLICY__ENABLED, true);
    const agreementHeader = env.AI_INSIGHT_POLICY__AGREEMENT_HEADER || "x-agreement-id";
    const assetHeader = env.AI_INSIGHT_POLICY__ASSET_HEADER || "x-asset-id";
    const roleHeader = env.AI_INSIGHT_POLICY__ROLE_HEADER || "x-user-roles";
    const requiredRoles = parseList(env.AI_INSIGHT_POLICY__REQUIRED_ROLES, ["ai_insight_consumer"]);
    const allowedAgreements = parseList(env.AI_INSIGHT_POLICY__ALLOWED_AGREEMENT_IDS, []);
    const allowedAssets = parseList(env.AI_INSIGHT_POLICY__ALLOWED_ASSET_IDS, []);

    const agreementId = String(pickHeader(agreementHeader) || "").trim();
    const assetId = String(pickHeader(assetHeader) || "").trim();
    const rawRoles = String(pickHeader(roleHeader) || "").trim();
    const roles = rawRoles ? rawRoles.split(",").map((item) => item.trim()).filter(Boolean) : [];

    if (policyEnabled) {
        if (!agreementId || !assetId || roles.length === 0) {
            return {
                decision: "forbidden",
                statusCode: 403,
                payload: { detail: "Missing required governance headers" },
                buckets,
            };
        }

        const missingRole = requiredRoles.find((role) => !roles.includes(role));
        if (missingRole) {
            return {
                decision: "forbidden",
                statusCode: 403,
                payload: { detail: `Policy denied: missing required role ${missingRole}` },
                buckets,
            };
        }

        if (allowedAgreements.length > 0 && !allowedAgreements.includes(agreementId)) {
            return {
                decision: "forbidden",
                statusCode: 403,
                payload: { detail: "Policy denied for agreement_id" },
                buckets,
            };
        }

        if (allowedAssets.length > 0 && !allowedAssets.includes(assetId)) {
            return {
                decision: "forbidden",
                statusCode: 403,
                payload: { detail: "Policy denied for asset_id" },
                buckets,
            };
        }
    }

    const rateLimitEnabled = toBool(env.AI_INSIGHT_RATE_LIMIT__ENABLED, true);
    const rpm = Math.max(1, Number(env.AI_INSIGHT_RATE_LIMIT__REQUESTS_PER_MINUTE || 10));
    const limiterAgreement = agreementId || "anonymous";
    const nextBuckets = JSON.parse(JSON.stringify(buckets));

    if (rateLimitEnabled) {
        const windowMs = 60 * 1000;
        let bucket = nextBuckets[limiterAgreement];
        if (!bucket || nowMs - bucket.windowStart >= windowMs) {
            bucket = { windowStart: nowMs, count: 0 };
        }
        if (bucket.count >= rpm) {
            const retryAfter = Math.max(1, Math.ceil((bucket.windowStart + windowMs - nowMs) / 1000));
            nextBuckets[limiterAgreement] = bucket;
            return {
                decision: "rate_limited",
                statusCode: 429,
                headers: { "Retry-After": String(retryAfter) },
                payload: { detail: "Agreement rate limit exceeded" },
                buckets: nextBuckets,
            };
        }
        bucket.count += 1;
        nextBuckets[limiterAgreement] = bucket;
    }

    return {
        decision: "ok",
        accessContext: {
            agreement_id: agreementId || "unknown-agreement",
            asset_id: assetId || "unknown-asset",
            roles,
        },
        buckets: nextBuckets,
    };
}

module.exports = {
    evaluatePolicyAndRateLimit,
};
