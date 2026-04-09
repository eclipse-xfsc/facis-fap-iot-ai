"""Configuration for the SFTP Ingestion Service."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class SftpConfig(BaseSettings):
    """SFTP server connection settings."""

    model_config = SettingsConfigDict(env_prefix="SFTP_")

    host: str = "localhost"
    port: int = 22
    username: str = "facis"
    password: str | None = None
    key_filename: str | None = None
    remote_path: str = "/ingest"
    archive_path: str = "/archive"
    poll_interval_seconds: int = 60
    known_hosts_file: str | None = None


class KafkaConfig(BaseSettings):
    """Kafka producer settings."""

    model_config = SettingsConfigDict(env_prefix="KAFKA_")

    bootstrap_servers: str = "kafka:9092"
    client_id: str = "facis-sftp-ingestion"
    security_protocol: str = "PLAINTEXT"
    ssl_ca_location: str | None = None
    ssl_certificate_location: str | None = None
    ssl_key_location: str | None = None


class IngestConfig(BaseSettings):
    """Ingestion behavior settings."""

    model_config = SettingsConfigDict(env_prefix="INGEST_")

    # Default Kafka topic for ingested files (can be overridden per subdirectory)
    default_topic: str = "sftp.ingest.raw"
    # File extensions to accept (comma-separated)
    accepted_extensions: str = ".json,.csv,.avro"
    # Maximum file size in bytes (default 100MB)
    max_file_size_bytes: int = Field(default=100 * 1024 * 1024)
    # Dead-letter topic for unparseable files
    dlq_topic: str = "sftp.ingest.dlq"


class HttpConfig(BaseSettings):
    """HTTP server settings."""

    model_config = SettingsConfigDict(env_prefix="HTTP_")

    host: str = "0.0.0.0"
    port: int = 8080


class Settings(BaseSettings):
    """Root settings container."""

    sftp: SftpConfig = SftpConfig()
    kafka: KafkaConfig = KafkaConfig()
    ingest: IngestConfig = IngestConfig()
    http: HttpConfig = HttpConfig()


def load_settings() -> Settings:
    """Load settings from environment variables."""
    return Settings()
