const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readJson(relPath) {
    const fullPath = path.join(__dirname, "..", "..", relPath);
    const raw = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(raw);
}

test("health-check flow exports a tab and at least one runtime node", () => {
    const flow = readJson(path.join("flows", "ai-insight-orce.json"));
    assert.ok(Array.isArray(flow), "flow export must be an array");

    const tabs = flow.filter((n) => n.type === "tab");
    const runtimeNodes = flow.filter((n) => n.type !== "tab");

    assert.equal(tabs.length, 1, "expected one tab in health-check flow");
    assert.ok(runtimeNodes.length >= 1, "expected at least one runtime node");
});

test("health endpoint flow is exported with expected contract", () => {
    const flow = readJson(path.join("flows", "ai-insight-orce.json"));

    const healthIn = flow.find(
        (n) => n.type === "http in" && n.url === "/api/v1/health" && n.method === "get",
    );
    assert.ok(healthIn, "missing GET /api/v1/health http in node");

    const healthFn = flow.find((n) => n.id === "fn_health_response");
    assert.ok(healthFn, "missing BuildHealthResponse function node");
    assert.match(healthFn.func, /msg\.statusCode\s*=\s*200/);
    assert.match(healthFn.func, /status:\s*"ok"/);
    assert.match(healthFn.func, /service:\s*"ai-insight-service"/);

    const healthOut = flow.find((n) => n.id === "http_out_health_ok");
    assert.ok(healthOut, "missing health 200 response node");
    assert.equal(healthOut.type, "http response");
});

test("health endpoint exports error handling chain", () => {
    const flow = readJson(path.join("flows", "ai-insight-orce.json"));

    const catchNode = flow.find((n) => n.id === "catch_health_errors");
    assert.ok(catchNode, "missing catch node for health flow");
    assert.equal(catchNode.type, "catch");

    const errFn = flow.find((n) => n.id === "fn_health_error");
    assert.ok(errFn, "missing BuildHealthError function node");
    assert.match(errFn.func, /msg\.statusCode\s*=\s*500/);
    assert.match(errFn.func, /internal_error/);

    const errOut = flow.find((n) => n.id === "http_out_health_error");
    assert.ok(errOut, "missing health 500 response node");
    assert.equal(errOut.type, "http response");

    const errDebug = flow.find((n) => n.id === "debug_health_error");
    assert.ok(errDebug, "missing health error debug node");
    assert.equal(errDebug.type, "debug");
});

test("anomaly endpoint flow exports expected HTTP route and status responses", () => {
    const flow = readJson(path.join("flows", "ai-insight-anomaly.json"));
    assert.ok(Array.isArray(flow), "anomaly flow export must be an array");

    const anomalyIn = flow.find(
        (n) =>
            n.type === "http in" &&
            n.url === "/api/v1/insights/anomaly-report" &&
            n.method === "post",
    );
    assert.ok(anomalyIn, "missing POST /api/v1/insights/anomaly-report http in node");

    const responseNodes = flow.filter((n) => n.type === "http response");
    const responseNames = responseNodes.map((n) => n.name);
    assert.ok(responseNames.includes("Anomaly 200 JSON"), "missing 200 response node");
    assert.ok(responseNames.includes("Anomaly 400 JSON"), "missing 400 response node");
    assert.ok(responseNames.includes("Anomaly 403 JSON"), "missing 403 response node");
    assert.ok(responseNames.includes("Anomaly 429 JSON"), "missing 429 response node");
    assert.ok(responseNames.includes("Anomaly 502 JSON"), "missing 502 response node");
});

test("anomaly flow contains policy and rate limit handling", () => {
    const flow = readJson(path.join("flows", "ai-insight-anomaly.json"));

    const policyNode = flow.find((n) => n.id === "fn_policy_rate_limit");
    assert.ok(policyNode, "missing PolicyAndRateLimit function node");
    assert.match(policyNode.func, /AI_INSIGHT_POLICY__ENABLED/);
    assert.match(policyNode.func, /AI_INSIGHT_RATE_LIMIT__ENABLED/);
    assert.match(policyNode.func, /Retry-After/);
});

test("anomaly flow wires reusable Trino and anomaly subflows", () => {
    const flow = readJson(path.join("flows", "ai-insight-anomaly.json"));

    const trinoTokenDef = flow.find(
        (n) => n.type === "subflow" && n.id === "subflow_trino_token",
    );
    const trinoQueryDef = flow.find(
        (n) => n.type === "subflow" && n.id === "subflow_trino_query",
    );
    const anomalyExecDef = flow.find(
        (n) => n.type === "subflow" && n.id === "subflow_anomaly_exec",
    );

    assert.ok(trinoTokenDef, "missing GetTrinoToken subflow definition");
    assert.ok(trinoQueryDef, "missing RunTrinoQuery subflow definition");
    assert.ok(anomalyExecDef, "missing RunAnomalySubflow definition");

    const trinoTokenNode = flow.find((n) => n.type === "subflow:subflow_trino_token");
    const trinoQueryNode = flow.find((n) => n.type === "subflow:subflow_trino_query");
    const anomalyExecNode = flow.find((n) => n.type === "subflow:subflow_anomaly_exec");

    assert.ok(trinoTokenNode, "missing subflow instance: GetTrinoToken");
    assert.ok(trinoQueryNode, "missing subflow instance: RunTrinoQuery");
    assert.ok(anomalyExecNode, "missing subflow instance: RunAnomalySubflow");
});

test("anomaly subflows map Trino and LLM environment contract", () => {
    const flow = readJson(path.join("flows", "ai-insight-anomaly.json"));

    const tokenFn = flow.find((n) => n.id === "fn_get_trino_token_prepare");
    const queryFn = flow.find((n) => n.id === "fn_run_trino_query_prepare");
    const execFn = flow.find((n) => n.id === "fn_run_anomaly_exec_prepare");
    const llmFinalizeFn = flow.find((n) => n.id === "fn_run_anomaly_exec_finish");

    assert.ok(tokenFn, "missing token function node");
    assert.ok(queryFn, "missing query function node");
    assert.ok(execFn, "missing anomaly execution function node");
    assert.ok(llmFinalizeFn, "missing anomaly finalize function node");

    assert.match(tokenFn.func, /AI_INSIGHT_TRINO__OIDC_TOKEN_URL/);
    assert.match(tokenFn.func, /AI_INSIGHT_TRINO__OIDC_CLIENT_ID/);
    assert.match(queryFn.func, /AI_INSIGHT_TRINO__TABLE_NET_GRID_HOURLY/);
    assert.match(queryFn.func, /Authorization': `Bearer/);
    assert.match(execFn.func, /AI_INSIGHT_LLM__CHAT_COMPLETIONS_URL/);
    assert.match(execFn.func, /rule-based-fallback/);
    assert.match(execFn.func, /AI_INSIGHT_CACHE__ENABLED/);
    assert.match(llmFinalizeFn.func, /LLM request failed with status/);
});

test("energy-summary endpoint flow exports expected HTTP route and status responses", () => {
    const flow = readJson(path.join("flows", "ai-insight-energy-summary.json"));
    assert.ok(Array.isArray(flow), "energy flow export must be an array");

    const energyIn = flow.find(
        (n) =>
            n.type === "http in" &&
            n.url === "/api/v1/insights/energy-summary" &&
            n.method === "post",
    );
    assert.ok(energyIn, "missing POST /api/v1/insights/energy-summary http in node");

    const responseNodes = flow.filter((n) => n.type === "http response");
    const responseNames = responseNodes.map((n) => n.name);
    assert.ok(responseNames.includes("Energy 200 JSON"), "missing 200 response node");
    assert.ok(responseNames.includes("Energy 400 JSON"), "missing 400 response node");
    assert.ok(responseNames.includes("Energy 403 JSON"), "missing 403 response node");
    assert.ok(responseNames.includes("Energy 429 JSON"), "missing 429 response node");
    assert.ok(responseNames.includes("Energy 502 JSON"), "missing 502 response node");
});

test("energy-summary flow validates payload and policy/rate-limit contract", () => {
    const flow = readJson(path.join("flows", "ai-insight-energy-summary.json"));

    const validateNode = flow.find((n) => n.id === "fn_validate_energy_request");
    const policyNode = flow.find((n) => n.id === "fn_policy_rate_limit_energy");
    assert.ok(validateNode, "missing ValidateEnergySummaryRequest function node");
    assert.ok(policyNode, "missing PolicyAndRateLimit function node");

    assert.match(validateNode.func, /forecast_alpha must be within \(0, 1\]/);
    assert.match(validateNode.func, /trend_epsilon must be >= 0/);
    assert.match(
        validateNode.func,
        /daily_overview_strategy must be strict_daily or fallback_hourly/,
    );

    assert.match(policyNode.func, /AI_INSIGHT_POLICY__ENABLED/);
    assert.match(policyNode.func, /AI_INSIGHT_RATE_LIMIT__ENABLED/);
    assert.match(policyNode.func, /Retry-After/);
});

test("energy-summary flow wires Trino and execution subflows", () => {
    const flow = readJson(path.join("flows", "ai-insight-energy-summary.json"));

    const trinoQueryDef = flow.find(
        (n) => n.type === "subflow" && n.id === "subflow_trino_query_energy",
    );
    const energyExecDef = flow.find(
        (n) => n.type === "subflow" && n.id === "subflow_energy_exec",
    );

    assert.ok(trinoQueryDef, "missing RunTrinoQueryEnergy subflow definition");
    assert.ok(energyExecDef, "missing RunEnergySummarySubflow definition");

    const trinoTokenNode = flow.find((n) => n.type === "subflow:subflow_trino_token");
    const trinoQueryNode = flow.find(
        (n) => n.type === "subflow:subflow_trino_query_energy",
    );
    const energyExecNode = flow.find((n) => n.type === "subflow:subflow_energy_exec");

    assert.ok(trinoTokenNode, "missing subflow instance: GetTrinoToken");
    assert.ok(trinoQueryNode, "missing subflow instance: RunTrinoQueryEnergy");
    assert.ok(energyExecNode, "missing subflow instance: RunEnergySummarySubflow");
});

test("energy-summary subflows map Trino and LLM environment contract", () => {
    const flow = readJson(path.join("flows", "ai-insight-energy-summary.json"));

    const trinoPrepareFn = flow.find((n) => n.id === "fn_run_trino_energy_prepare");
    const trinoCollectFn = flow.find((n) => n.id === "fn_run_trino_energy_collect");
    const execPrepareFn = flow.find((n) => n.id === "fn_run_energy_exec_prepare");
    const execFinishFn = flow.find((n) => n.id === "fn_run_energy_exec_finish");

    assert.ok(trinoPrepareFn, "missing energy trino prepare function node");
    assert.ok(trinoCollectFn, "missing energy trino collect function node");
    assert.ok(execPrepareFn, "missing energy execution prepare function node");
    assert.ok(execFinishFn, "missing energy execution finalize function node");

    assert.match(trinoPrepareFn.func, /AI_INSIGHT_TRINO__TABLE_NET_GRID_HOURLY/);
    assert.match(trinoPrepareFn.func, /AI_INSIGHT_TRINO__TABLE_WEATHER_HOURLY/);
    assert.match(trinoPrepareFn.func, /AI_INSIGHT_TRINO__TABLE_ENERGY_COST_DAILY/);
    assert.match(trinoPrepareFn.func, /AI_INSIGHT_TRINO__TABLE_PV_SELF_CONSUMPTION_DAILY/);
    assert.match(trinoCollectFn.func, /nextUri/);
    assert.match(execPrepareFn.func, /AI_INSIGHT_LLM__CHAT_COMPLETIONS_URL/);
    assert.match(execPrepareFn.func, /AI_INSIGHT_CACHE__ENABLED/);
    assert.match(execFinishFn.func, /LLM request failed with status/);
});

test("city-status endpoint flow exports expected HTTP route and status responses", () => {
    const flow = readJson(path.join("flows", "ai-insight-city-status.json"));
    assert.ok(Array.isArray(flow), "city flow export must be an array");

    const cityIn = flow.find(
        (n) =>
            n.type === "http in" &&
            n.url === "/api/v1/insights/city-status" &&
            n.method === "post",
    );
    assert.ok(cityIn, "missing POST /api/v1/insights/city-status http in node");

    const responseNodes = flow.filter((n) => n.type === "http response");
    const responseNames = responseNodes.map((n) => n.name);
    assert.ok(responseNames.includes("City 200 JSON"), "missing 200 response node");
    assert.ok(responseNames.includes("City 400 JSON"), "missing 400 response node");
    assert.ok(responseNames.includes("City 403 JSON"), "missing 403 response node");
    assert.ok(responseNames.includes("City 429 JSON"), "missing 429 response node");
    assert.ok(responseNames.includes("City 502 JSON"), "missing 502 response node");
});

test("city-status flow validates payload and policy/rate-limit contract", () => {
    const flow = readJson(path.join("flows", "ai-insight-city-status.json"));

    const validateNode = flow.find((n) => n.id === "fn_validate_city_request");
    const policyNode = flow.find((n) => n.id === "fn_policy_rate_limit_city");
    assert.ok(validateNode, "missing ValidateCityStatusRequest function node");
    assert.ok(policyNode, "missing PolicyAndRateLimit function node");

    assert.match(validateNode.func, /start_ts and end_ts must be valid timestamps/);
    assert.match(validateNode.func, /start_ts must be earlier than end_ts/);
    assert.match(policyNode.func, /AI_INSIGHT_POLICY__ENABLED/);
    assert.match(policyNode.func, /AI_INSIGHT_RATE_LIMIT__ENABLED/);
    assert.match(policyNode.func, /Retry-After/);
});

test("city-status flow wires Trino and execution subflows", () => {
    const flow = readJson(path.join("flows", "ai-insight-city-status.json"));

    const trinoQueryDef = flow.find(
        (n) => n.type === "subflow" && n.id === "subflow_trino_query_city",
    );
    const cityExecDef = flow.find(
        (n) => n.type === "subflow" && n.id === "subflow_city_exec",
    );

    assert.ok(trinoQueryDef, "missing RunTrinoQueryCity subflow definition");
    assert.ok(cityExecDef, "missing RunCityStatusSubflow definition");

    const trinoTokenNode = flow.find((n) => n.type === "subflow:subflow_trino_token");
    const trinoQueryNode = flow.find(
        (n) => n.type === "subflow:subflow_trino_query_city",
    );
    const cityExecNode = flow.find((n) => n.type === "subflow:subflow_city_exec");

    assert.ok(trinoTokenNode, "missing subflow instance: GetTrinoToken");
    assert.ok(trinoQueryNode, "missing subflow instance: RunTrinoQueryCity");
    assert.ok(cityExecNode, "missing subflow instance: RunCityStatusSubflow");
});

test("city-status subflows map Trino and LLM environment contract", () => {
    const flow = readJson(path.join("flows", "ai-insight-city-status.json"));

    const trinoPrepareFn = flow.find((n) => n.id === "fn_run_trino_city_prepare");
    const trinoCollectFn = flow.find((n) => n.id === "fn_run_trino_city_collect");
    const execPrepareFn = flow.find((n) => n.id === "fn_run_city_exec_prepare");
    const execFinishFn = flow.find((n) => n.id === "fn_run_city_exec_finish");

    assert.ok(trinoPrepareFn, "missing city trino prepare function node");
    assert.ok(trinoCollectFn, "missing city trino collect function node");
    assert.ok(execPrepareFn, "missing city execution prepare function node");
    assert.ok(execFinishFn, "missing city execution finalize function node");

    assert.match(trinoPrepareFn.func, /AI_INSIGHT_TRINO__TABLE_EVENT_IMPACT_DAILY/);
    assert.match(trinoPrepareFn.func, /AI_INSIGHT_TRINO__TABLE_STREETLIGHT_ZONE_HOURLY/);
    assert.match(trinoCollectFn.func, /nextUri/);
    assert.match(execPrepareFn.func, /AI_INSIGHT_LLM__CHAT_COMPLETIONS_URL/);
    assert.match(execPrepareFn.func, /AI_INSIGHT_CACHE__ENABLED/);
    assert.match(execFinishFn.func, /LLM request failed with status/);
});

test("latest endpoint flow exports expected HTTP route and status responses", () => {
    const flow = readJson(path.join("flows", "ai-insight-latest.json"));
    assert.ok(Array.isArray(flow), "latest flow export must be an array");

    const latestIn = flow.find(
        (n) =>
            n.type === "http in" &&
            n.url === "/api/v1/insights/latest" &&
            n.method === "get",
    );
    assert.ok(latestIn, "missing GET /api/v1/insights/latest http in node");

    const responseNodes = flow.filter((n) => n.type === "http response");
    const responseNames = responseNodes.map((n) => n.name);
    assert.ok(responseNames.includes("Latest 200 JSON"), "missing 200 response node");
    assert.ok(responseNames.includes("Latest 500 JSON"), "missing 500 response node");
});

test("latest flow builds expected payload contract and insight keys", () => {
    const flow = readJson(path.join("flows", "ai-insight-latest.json"));
    const buildNode = flow.find((n) => n.id === "fn_build_latest_response");
    assert.ok(buildNode, "missing BuildLatestInsightsResponse function node");

    assert.match(buildNode.func, /energy-summary/);
    assert.match(buildNode.func, /anomaly-report/);
    assert.match(buildNode.func, /city-status/);
    assert.match(buildNode.func, /llm_model/);
    assert.match(buildNode.func, /rule-based-fallback/);
    assert.match(buildNode.func, /msg\.payload = \{ latest \}/);
});

test("outputs endpoint flow exports expected HTTP route and status responses", () => {
    const flow = readJson(path.join("flows", "ai-insight-outputs.json"));
    assert.ok(Array.isArray(flow), "outputs flow export must be an array");

    const outputIn = flow.find(
        (n) =>
            n.type === "http in" &&
            n.url === "/api/ai/outputs/:output_id" &&
            n.method === "get",
    );
    assert.ok(outputIn, "missing GET /api/ai/outputs/:output_id http in node");

    const responseNodes = flow.filter((n) => n.type === "http response");
    const responseNames = responseNodes.map((n) => n.name);
    assert.ok(responseNames.includes("Output 200 JSON"), "missing 200 response node");
    assert.ok(responseNames.includes("Output 404 JSON"), "missing 404 response node");
    assert.ok(responseNames.includes("Output 500 JSON"), "missing 500 response node");
});

test("outputs flow contains output id lookup and expected payload shape", () => {
    const flow = readJson(path.join("flows", "ai-insight-outputs.json"));
    const lookupNode = flow.find((n) => n.id === "fn_lookup_output_by_id");
    assert.ok(lookupNode, "missing LookupOutputById function node");

    assert.match(lookupNode.func, /Output not found/);
    assert.match(lookupNode.func, /aiInsightOutputsById/);
    assert.match(lookupNode.func, /msg\.req/);

    const anomalyFlow = readJson(path.join("flows", "ai-insight-anomaly.json"));
    const energyFlow = readJson(path.join("flows", "ai-insight-energy-summary.json"));
    const cityFlow = readJson(path.join("flows", "ai-insight-city-status.json"));

    const anomalyStore = anomalyFlow.find((n) => n.id === "fn_store_latest_anomaly");
    const energyStore = energyFlow.find((n) => n.id === "fn_store_latest_energy");
    const cityStore = cityFlow.find((n) => n.id === "fn_store_latest_city");

    assert.ok(anomalyStore, "missing anomaly latest store function");
    assert.ok(energyStore, "missing energy latest store function");
    assert.ok(cityStore, "missing city latest store function");

    assert.match(anomalyStore.func, /aiInsightOutputsById/);
    assert.match(energyStore.func, /aiInsightOutputsById/);
    assert.match(cityStore.func, /aiInsightOutputsById/);
    assert.match(anomalyStore.func, /output_text/);
    assert.match(energyStore.func, /structured_output/);
    assert.match(cityStore.func, /input_data/);
});

test("openapi flow exports /openapi.json, /docs and /redoc endpoints", () => {
    const flow = readJson(path.join("flows", "ai-insight-openapi.json"));
    assert.ok(Array.isArray(flow), "openapi flow export must be an array");

    const openapiIn = flow.find(
        (n) => n.type === "http in" && n.url === "/openapi.json" && n.method === "get",
    );
    const docsIn = flow.find(
        (n) => n.type === "http in" && n.url === "/docs" && n.method === "get",
    );
    const redocIn = flow.find(
        (n) => n.type === "http in" && n.url === "/redoc" && n.method === "get",
    );

    assert.ok(openapiIn, "missing GET /openapi.json http in node");
    assert.ok(docsIn, "missing GET /docs http in node");
    assert.ok(redocIn, "missing GET /redoc http in node");

    const responseNames = flow
        .filter((n) => n.type === "http response")
        .map((n) => n.name);
    assert.ok(responseNames.includes("OpenAPI 200 JSON"), "missing OpenAPI 200 response");
    assert.ok(responseNames.includes("Docs 200 HTML"), "missing docs 200 response");
    assert.ok(responseNames.includes("ReDoc 200 HTML"), "missing redoc 200 response");
    assert.ok(responseNames.includes("OpenAPI 500 JSON"), "missing OpenAPI 500 response");
});

test("openapi flow contains full contract for all ORCE endpoints", () => {
    const flow = readJson(path.join("flows", "ai-insight-openapi.json"));
    const specBuilder = flow.find((n) => n.id === "fn_build_openapi_spec");
    const docsBuilder = flow.find((n) => n.id === "fn_build_docs_html");
    assert.ok(specBuilder, "missing BuildOpenApiSpec function node");
    assert.ok(docsBuilder, "missing BuildSwaggerUiHtml function node");

    assert.match(specBuilder.func, /openapi:\s*'3\.0\.3'/);
    assert.ok(specBuilder.func.includes("/api/v1/health"));
    assert.ok(specBuilder.func.includes("/api/v1/insights/anomaly-report"));
    assert.ok(specBuilder.func.includes("/api/v1/insights/energy-summary"));
    assert.ok(specBuilder.func.includes("/api/v1/insights/city-status"));
    assert.ok(specBuilder.func.includes("/api/v1/insights/latest"));
    assert.ok(specBuilder.func.includes("/api/ai/outputs/{output_id}"));
    assert.match(specBuilder.func, /Retry-After/);
    assert.match(specBuilder.func, /x-agreement-id/);
    assert.match(specBuilder.func, /LatestInsightsResponse/);
    assert.match(specBuilder.func, /AIOutputEntityResponse/);
    assert.match(specBuilder.func, /strict_daily/);
    assert.match(specBuilder.func, /fallback_hourly/);
    assert.match(specBuilder.func, /Accepted values:/);

    assert.match(docsBuilder.func, /SwaggerUIBundle/);
    assert.ok(docsBuilder.func.includes("/openapi.json"));

    const redocBuilder = flow.find((n) => n.id === "fn_build_redoc_html");
    assert.ok(redocBuilder, "missing BuildRedocHtml function node");
    assert.match(redocBuilder.func, /redoc\.standalone\.js/);
    assert.ok(redocBuilder.func.includes('spec-url=\"/openapi.json\"'));
});
