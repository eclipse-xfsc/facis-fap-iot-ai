"use strict";

const INSIGHT_TYPES = ["energy-summary", "anomaly-report", "city-status"];

function buildLatestInsightsResponse(latestStore = {}, now = new Date().toISOString()) {
    function sanitizeOutput(insightType, storedOutput) {
        const output = storedOutput && typeof storedOutput === "object" ? storedOutput : {};
        const metadata = output.metadata && typeof output.metadata === "object" ? output.metadata : {};
        const llmModel = String(metadata.llm_model || "rule-based-fallback");

        return {
            insight_type: insightType,
            summary: String(output.summary || ""),
            key_findings: Array.isArray(output.key_findings) ? output.key_findings.map((v) => String(v)) : [],
            recommendations: Array.isArray(output.recommendations)
                ? output.recommendations.map((v) => String(v))
                : [],
            metadata: {
                output_id: String(metadata.output_id || `latest-${insightType}`),
                llm_model: llmModel,
                timestamp: String(metadata.timestamp || now),
                llm_used: llmModel !== "rule-based-fallback",
                agreement_id: String(metadata.agreement_id || "unknown-agreement"),
                asset_id: String(metadata.asset_id || "unknown-asset"),
                llm_error: null,
            },
            data: output.data === undefined ? null : output.data,
        };
    }

    const latest = {};
    for (const insightType of INSIGHT_TYPES) {
        const entry = latestStore[insightType];
        if (!entry || typeof entry !== "object") {
            latest[insightType] = null;
            continue;
        }
        latest[insightType] = {
            cached_at: String(entry.cached_at || now),
            output: sanitizeOutput(insightType, entry.output),
        };
    }
    return { latest };
}

module.exports = {
    INSIGHT_TYPES,
    buildLatestInsightsResponse,
};
