# SFTP Ingestion Service

Polls an SFTP directory for new files and publishes them to Kafka as Bronze-layer envelopes.
Implements **FR-DL-003** (SFTP file ingestion) from the FACIS IoT & AI SRS.

## Architecture

```
SFTP Server ──> [SftpPoller] ──> [KafkaPublisher] ──> Kafka (Bronze topic)
                     |
                     v
               Archive directory
```

**Workflow per poll cycle:**

1. Connect to SFTP server (with host key verification)
2. List files in `remote_path`, filter by extension and size
3. Download and parse each file (JSON passthrough, CSV to JSON)
4. Wrap records in Bronze envelopes with ingestion metadata
5. Publish to Kafka topic
6. Move processed files to `archive_path`

## Quick Start

### Local Development

```bash
pip install -e ".[dev]"

# Set required environment variables
export SFTP_HOST=localhost
export SFTP_USERNAME=facis
export SFTP_PASSWORD=secret
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092

python -m src.main
```

### Docker

```bash
docker build -t facis-sftp-ingestion .
docker run -e SFTP_HOST=sftp-server -e KAFKA_BOOTSTRAP_SERVERS=kafka:9092 facis-sftp-ingestion
```

### Kubernetes

```bash
# Create SFTP credentials secret
kubectl create secret generic sftp-credentials \
  --from-literal=sftp_password=<password> \
  -n facis

helm install facis-sftp-ingestion helm/facis-sftp-ingestion/ \
  --namespace facis --create-namespace \
  --set sftp.host=<sftp-server> \
  --set kafka.bootstrapServers=kafka-0:9092,kafka-1:9092,kafka-2:9092
```

## Configuration

All settings are configured via environment variables:

### SFTP Connection (`SFTP_` prefix)

| Variable | Default | Description |
|----------|---------|-------------|
| `SFTP_HOST` | `localhost` | SFTP server hostname |
| `SFTP_PORT` | `22` | SFTP server port |
| `SFTP_USERNAME` | `facis` | SFTP username |
| `SFTP_PASSWORD` | — | SFTP password (or use key auth) |
| `SFTP_KEY_FILENAME` | — | Path to SSH private key file |
| `SFTP_REMOTE_PATH` | `/ingest` | Directory to poll for new files |
| `SFTP_ARCHIVE_PATH` | `/archive` | Directory for processed files |
| `SFTP_POLL_INTERVAL_SECONDS` | `60` | Polling interval |
| `SFTP_KNOWN_HOSTS_FILE` | — | Path to known_hosts for host key verification |

### Kafka Producer (`KAFKA_` prefix)

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:9092` | Kafka broker addresses |
| `KAFKA_CLIENT_ID` | `facis-sftp-ingestion` | Producer client ID |
| `KAFKA_SECURITY_PROTOCOL` | `PLAINTEXT` | Security protocol (PLAINTEXT, SSL, SASL_SSL) |

### Ingestion Behavior (`INGEST_` prefix)

| Variable | Default | Description |
|----------|---------|-------------|
| `INGEST_DEFAULT_TOPIC` | `sftp.ingest.raw` | Target Kafka topic |
| `INGEST_ACCEPTED_EXTENSIONS` | `.json,.csv,.avro` | Comma-separated accepted file extensions |
| `INGEST_MAX_FILE_SIZE_BYTES` | `104857600` (100 MB) | Maximum file size |
| `INGEST_DLQ_TOPIC` | `sftp.ingest.dlq` | Dead-letter topic for errors |

## Supported File Formats

| Format | Behavior |
|--------|----------|
| `.json` | Parsed as JSON; arrays produce one record per element |
| `.csv` | Parsed via `csv.DictReader`; one record per row |
| Other | Raw content stored as `{"raw_content": "..."}` |

## Bronze Envelope Schema

Each record is wrapped in a Bronze envelope:

```json
{
  "ingest_timestamp": "2026-04-07T12:00:00.000Z",
  "source_topic": "sftp://host/ingest/filename.json",
  "kafka_partition": 0,
  "kafka_offset": 0,
  "kafka_key": "filename.json",
  "raw_payload": "{...original content...}"
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/metrics` | Prometheus metrics |

## Testing

```bash
pip install -e ".[dev]"
pytest tests/
```

## License

Apache License 2.0 — see [LICENSE](../../LICENSE).
