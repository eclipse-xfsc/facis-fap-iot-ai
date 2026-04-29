"""Unit tests for SftpPoller file parsing logic."""

import json

import pytest

from src.config import IngestConfig, SftpConfig
from src.sftp_poller import SftpPoller


@pytest.fixture
def poller() -> SftpPoller:
    return SftpPoller(
        sftp_config=SftpConfig(host="test", username="test", password="test"),
        ingest_config=IngestConfig(),
    )


class TestParseFile:
    """Test _parse_file method for different formats."""

    def test_parse_json_single_object(self, poller: SftpPoller) -> None:
        content = json.dumps({"meter_id": "meter-001", "power_kw": 42.5}).encode()
        result = poller._parse_file("reading.json", content)
        assert len(result) == 1
        assert result[0]["meter_id"] == "meter-001"
        assert result[0]["power_kw"] == 42.5

    def test_parse_json_array(self, poller: SftpPoller) -> None:
        content = json.dumps([
            {"meter_id": "meter-001", "power_kw": 42.5},
            {"meter_id": "meter-002", "power_kw": 38.1},
        ]).encode()
        result = poller._parse_file("readings.json", content)
        assert len(result) == 2
        assert result[1]["meter_id"] == "meter-002"

    def test_parse_csv(self, poller: SftpPoller) -> None:
        content = (
            b"meter_id,power_kw,timestamp\n"
            b"meter-001,42.5,2026-04-07T12:00:00Z\n"
            b"meter-002,38.1,2026-04-07T12:01:00Z"
        )
        result = poller._parse_file("readings.csv", content)
        assert len(result) == 2
        assert result[0]["meter_id"] == "meter-001"
        assert result[0]["power_kw"] == "42.5"

    def test_parse_unknown_extension(self, poller: SftpPoller) -> None:
        content = b"some raw data"
        result = poller._parse_file("data.txt", content)
        assert len(result) == 1
        assert "raw_content" in result[0]

    def test_parse_empty_json_array(self, poller: SftpPoller) -> None:
        content = b"[]"
        result = poller._parse_file("empty.json", content)
        assert len(result) == 0


class TestAcceptedExtensions:
    """Test extension filtering."""

    def test_default_accepted_extensions(self, poller: SftpPoller) -> None:
        assert ".json" in poller._accepted_extensions
        assert ".csv" in poller._accepted_extensions
        assert ".avro" in poller._accepted_extensions

    def test_custom_extensions(self) -> None:
        p = SftpPoller(
            sftp_config=SftpConfig(host="test", username="test", password="test"),
            ingest_config=IngestConfig(accepted_extensions=".json,.xml"),
        )
        assert ".json" in p._accepted_extensions
        assert ".xml" in p._accepted_extensions
        assert ".csv" not in p._accepted_extensions
