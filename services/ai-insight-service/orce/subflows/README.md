# Reusable Subflows

Each subflow encapsulates one reusable piece of the AI Insight ORCE runtime so the main HTTP flow tabs can compose them consistently.

| File | Purpose | Source mapping |
|---|---|---|
| `get-trino-token.subflow.json` | Retrieves and caches Trino OIDC access token used by downstream Trino requests. | `services/ai-insight-service/src/data/trino_client.py` (`_fetch_oidc_password_token`) |
| `run-trino-query.subflow.json` | Executes paginated Trino query flow for anomaly-report pipeline (`nextUri` handling + row aggregation). | `services/ai-insight-service/src/data/trino_client.py` + `src/api/rest/routes/insights.py` (`/anomaly-report`) |
| `run-anomaly.subflow.json` | Builds anomaly context, applies fallback/mirror logic, and prepares anomaly insight output contract. | `services/ai-insight-service/src/services/insight_orchestrator.py` (`run_anomaly_report`) |
| `run-trino-query-energy.subflow.json` | Executes chained Trino queries for energy-summary dataset collection (hourly + daily views). | `services/ai-insight-service/src/data/trino_client.py` (`fetch_energy_trend_forecast_rows`) |
| `run-energy-summary.subflow.json` | Computes energy-summary payload (trend, moving averages, seasonality, forecast, narrative hints). | `services/ai-insight-service/src/services/insight_orchestrator.py` (`run_energy_summary`) |
| `run-trino-query-city.subflow.json` | Executes city-status Trino query and pagination for smart-city correlation inputs. | `services/ai-insight-service/src/data/trino_client.py` (`fetch_smart_city_correlation_rows`) |
| `run-city-status.subflow.json` | Computes city-status analysis payload and recommendation context from smart-city metrics. | `services/ai-insight-service/src/services/insight_orchestrator.py` (`run_city_status`) |

Subflows are contract artifacts used for documentation and test workflows. Runtime startup merges operational definitions from `flows/*.json` into `/data/flows.json` through `entrypoint.sh`.
