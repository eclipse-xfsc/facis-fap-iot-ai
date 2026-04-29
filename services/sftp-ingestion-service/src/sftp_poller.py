"""SFTP directory poller — downloads new files for ingestion."""

from __future__ import annotations

import csv
import io
import json
import logging
import stat
from datetime import UTC, datetime
from pathlib import PurePosixPath
from typing import Any

import paramiko

from src.config import IngestConfig, SftpConfig

logger = logging.getLogger(__name__)


class SftpPoller:
    """
    Polls an SFTP directory for new files, downloads them, and yields
    Bronze-envelope-wrapped records for Kafka publishing.

    Workflow per poll cycle:
      1. List files in remote_path (non-recursive)
      2. Filter by accepted extensions and max file size
      3. Download each file
      4. Parse content (JSON passthrough, CSV→JSON conversion)
      5. Yield Bronze envelope dicts
      6. Move processed file to archive_path
    """

    def __init__(self, sftp_config: SftpConfig, ingest_config: IngestConfig) -> None:
        self._sftp_config = sftp_config
        self._ingest_config = ingest_config
        self._accepted_extensions = set(
            ext.strip() for ext in ingest_config.accepted_extensions.split(",")
        )

    def _connect(self) -> paramiko.SFTPClient:
        """Open an SFTP connection with host key verification."""
        client = paramiko.SSHClient()

        # Load host keys for server identity verification
        if self._sftp_config.known_hosts_file:
            client.load_host_keys(self._sftp_config.known_hosts_file)
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
        else:
            logger.warning(
                "No known_hosts_file configured — using RejectPolicy. "
                "Set SFTP_KNOWN_HOSTS_FILE to enable host key verification."
            )
            client.set_missing_host_key_policy(paramiko.RejectPolicy())

        connect_kwargs: dict[str, Any] = {
            "hostname": self._sftp_config.host,
            "port": self._sftp_config.port,
            "username": self._sftp_config.username,
        }
        if self._sftp_config.key_filename:
            connect_kwargs["key_filename"] = self._sftp_config.key_filename
        else:
            connect_kwargs["password"] = self._sftp_config.password

        client.connect(**connect_kwargs)
        sftp = client.open_sftp()

        # Store client reference on the SFTPClient so we can close it properly
        sftp._ssh_client = client  # type: ignore[attr-defined]
        return sftp

    def _ensure_archive_dir(self, sftp: paramiko.SFTPClient) -> None:
        """Create the archive directory if it doesn't exist."""
        try:
            sftp.stat(self._sftp_config.archive_path)
        except FileNotFoundError:
            sftp.mkdir(self._sftp_config.archive_path)

    def _parse_file(self, filename: str, content: bytes) -> list[dict]:
        """Parse file content into a list of JSON-serializable dicts."""
        ext = PurePosixPath(filename).suffix.lower()

        if ext == ".json":
            decoded = content.decode("utf-8")
            parsed = json.loads(decoded)
            # Handle both single objects and arrays
            if isinstance(parsed, list):
                return parsed
            return [parsed]

        if ext == ".csv":
            decoded = content.decode("utf-8")
            reader = csv.DictReader(io.StringIO(decoded))
            return [row for row in reader]

        # Unsupported format — return raw content as a single record
        return [{"raw_content": content.decode("utf-8", errors="replace")}]

    def poll(self) -> list[dict]:
        """
        Poll the SFTP directory and return Bronze envelope records.

        Each record follows the Bronze schema:
        {
            "ingest_timestamp": "2026-04-07T12:00:00.000Z",
            "source_topic": "sftp://host/path/filename",
            "kafka_partition": 0,
            "kafka_offset": 0,
            "kafka_key": "filename",
            "raw_payload": "{...original content...}"
        }
        """
        envelopes: list[dict] = []

        try:
            sftp = self._connect()
        except Exception as e:
            logger.error(f"SFTP connection failed: {e}")
            return envelopes

        try:
            self._ensure_archive_dir(sftp)

            # List files in remote directory
            try:
                entries = sftp.listdir_attr(self._sftp_config.remote_path)
            except FileNotFoundError:
                logger.warning(f"Remote path {self._sftp_config.remote_path} not found")
                return envelopes

            files = [
                e for e in entries
                if stat.S_ISREG(e.st_mode or 0)
                and PurePosixPath(e.filename).suffix.lower() in self._accepted_extensions
                and (e.st_size or 0) <= self._ingest_config.max_file_size_bytes
            ]

            if not files:
                logger.debug("No new files to process")
                return envelopes

            logger.info(f"Found {len(files)} file(s) to ingest")

            for entry in files:
                filename = entry.filename
                remote_file = f"{self._sftp_config.remote_path}/{filename}"
                archive_file = f"{self._sftp_config.archive_path}/{filename}"

                try:
                    # Download file content
                    with sftp.open(remote_file, "r") as f:
                        content = f.read()

                    # Parse file
                    records = self._parse_file(filename, content)
                    ingest_ts = datetime.now(UTC).isoformat()

                    # Wrap each record in Bronze envelope
                    for record in records:
                        envelope = {
                            "ingest_timestamp": ingest_ts,
                            "source_topic": f"sftp://{self._sftp_config.host}{remote_file}",
                            "kafka_partition": 0,
                            "kafka_offset": 0,
                            "kafka_key": filename,
                            "raw_payload": json.dumps(record, default=str),
                        }
                        envelopes.append(envelope)

                    # Move to archive
                    try:
                        sftp.rename(remote_file, archive_file)
                    except OSError:
                        # Archive file may already exist — add timestamp suffix
                        ts_suffix = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
                        sftp.rename(remote_file, f"{archive_file}.{ts_suffix}")

                    logger.info(
                        f"Ingested {filename}: {len(records)} record(s)"
                    )

                except Exception as e:
                    logger.error(f"Failed to process {filename}: {e}")
                    # Return what we have so far; this file will be retried next cycle

        finally:
            sftp.close()
            # Close the underlying SSH client to prevent transport leaks
            ssh_client = getattr(sftp, "_ssh_client", None)
            if ssh_client is not None:
                ssh_client.close()

        return envelopes
