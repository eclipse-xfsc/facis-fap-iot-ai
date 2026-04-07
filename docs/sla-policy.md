# FACIS FAP IoT & AI --- Service Level Agreement (SLA) Policy

## 1. Availability Targets

| Service | Target Availability | Measurement Window | Allowed Downtime/Month |
|---------|--------------------|--------------------|------------------------|
| AI Insight Service | 99.9% | Monthly | ~43 minutes |
| Simulation Service | 99.95% | Monthly | ~22 minutes |
| SFTP Ingestion Service | 99.5% | Monthly | ~3.6 hours |
| Trino SQL Engine | 99.9% | Monthly | ~43 minutes |
| Kafka Brokers | 99.95% | Monthly | ~22 minutes |

## 2. Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single pod failure | < 2 minutes | 0 (stateless services) |
| Node failure | < 5 minutes | 0 (K8s rescheduling) |
| Kafka broker failure | < 10 minutes | 0 (multi-broker replication) |
| Full cluster failure | < 30 minutes | Last CronJob run |

## 3. Resilience Mechanisms

### 3.1 Circuit Breaker (AI Insight Service)

The LLM client implements a circuit breaker pattern:

- **Closed** (normal): Requests pass through with retry logic (exponential backoff, max 3 retries).
- **Open** (after 5 consecutive failures): All requests are immediately rejected for 60 seconds. The service falls back to rule-based deterministic insights.
- **Half-open** (after recovery period): A single probe request is allowed. On success, the circuit closes. On failure, it reopens.

### 3.2 Health Checks

All services expose `/api/v1/health` endpoints monitored by:
- Kubernetes liveness probes (30s interval, 3 failure threshold)
- Kubernetes readiness probes (10s interval, 3 failure threshold)
- Prometheus `up` metric scraped via ServiceMonitor

### 3.3 Horizontal Pod Autoscaler

Both AI Insight and Simulation services support HPA with:
- Target CPU utilization: 70%
- Target memory utilization: 80%
- Min replicas: 1, Max replicas: 5

### 3.4 Multi-Broker Kafka

Kafka runs 3 brokers across separate nodes for partition-level redundancy.

## 4. Monitoring & Alerting

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| Service Down | `up == 0` for > 5 min | Critical | On-call page |
| LLM Error Rate > 10% | 15-min sliding window | Warning | Investigate provider status |
| Pod Restart Loop | > 3 restarts in 10 min | Warning | Check logs, resource limits |
| Kafka Consumer Lag > 1000 | Sustained | Warning | Scale consumers or investigate backpressure |
| Materializer Job Failed | Any batch job failure | Warning | Check Trino connectivity, re-run manually |

## 5. Maintenance Windows

- **Scheduled maintenance**: Announced 48 hours in advance via project communication channels.
- **Excluded from SLA**: Planned maintenance windows, force majeure, third-party provider outages (LLM API, IONOS infrastructure).

## 6. Escalation

| Level | Response Time | Contact |
|-------|--------------|---------|
| L1 | < 15 min | On-call engineer |
| L2 | < 1 hour | Platform team lead |
| L3 | < 4 hours | Architecture team |
