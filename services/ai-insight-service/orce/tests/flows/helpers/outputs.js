"use strict";

function buildFallbackOutputText(snapshot) {
    const findings = Array.isArray(snapshot.key_findings) ? snapshot.key_findings : [];
    const recs = Array.isArray(snapshot.recommendations) ? snapshot.recommendations : [];
    return [String(snapshot.summary || ""), ...findings.map((x) => `- ${String(x)}`), ...recs.map((x) => `- ${String(x)}`)]
        .filter((line) => String(line).trim().length > 0)
        .join("\n");
}

function storeOutputById({
    outputsById = {},
    insightType,
    snapshot,
    requestPayload = {},
    llmRawText = null,
    now = new Date().toISOString(),
}) {
    const metadata = snapshot && snapshot.metadata ? snapshot.metadata : {};
    const outputId = String(metadata.output_id || "").trim();
    if (!outputId) return outputsById;

    const next = JSON.parse(JSON.stringify(outputsById));
    next[outputId] = {
        id: outputId,
        insight_type: insightType,
        agreement_id: String(metadata.agreement_id || "unknown-agreement"),
        asset_id: String(metadata.asset_id || "unknown-asset"),
        input_data: JSON.parse(JSON.stringify(requestPayload || {})),
        llm_model: String(metadata.llm_model || "rule-based-fallback"),
        output_text: typeof llmRawText === "string" && llmRawText.trim() ? llmRawText.trim() : buildFallbackOutputText(snapshot),
        structured_output: {
            summary: String(snapshot.summary || ""),
            key_findings: Array.isArray(snapshot.key_findings) ? snapshot.key_findings.map((x) => String(x)) : [],
            recommendations: Array.isArray(snapshot.recommendations) ? snapshot.recommendations.map((x) => String(x)) : [],
        },
        timestamp: String(metadata.timestamp || now),
    };
    return next;
}

function lookupOutputById(outputsById = {}, outputId) {
    const id = String(outputId || "").trim();
    if (!id || !outputsById[id] || typeof outputsById[id] !== "object") {
        return { statusCode: 404, payload: { detail: "Output not found" } };
    }
    return { statusCode: 200, payload: JSON.parse(JSON.stringify(outputsById[id])) };
}

module.exports = {
    buildFallbackOutputText,
    storeOutputById,
    lookupOutputById,
};
