"use strict";

function assertOpenApiShape(spec) {
    const missing = [];
    const safeSpec = spec && typeof spec === "object" ? spec : {};
    if (!spec || typeof spec !== "object") missing.push("spec_object");
    if (!safeSpec.openapi) missing.push("openapi");
    if (!safeSpec.paths || typeof safeSpec.paths !== "object") missing.push("paths");
    if (!safeSpec.components || typeof safeSpec.components !== "object") missing.push("components");
    if (!safeSpec.components || !safeSpec.components.schemas) missing.push("components.schemas");
    return missing;
}

function assertRequiredPaths(spec) {
    const required = [
        "/api/v1/health",
        "/api/v1/insights/anomaly-report",
        "/api/v1/insights/energy-summary",
        "/api/v1/insights/city-status",
        "/api/v1/insights/latest",
        "/api/ai/outputs/{output_id}",
    ];
    const paths = (spec && spec.paths) || {};
    return required.filter((p) => !Object.prototype.hasOwnProperty.call(paths, p));
}

module.exports = {
    assertOpenApiShape,
    assertRequiredPaths,
};
