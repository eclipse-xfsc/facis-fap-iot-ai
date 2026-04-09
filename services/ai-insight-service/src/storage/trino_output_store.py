"""Trino-backed AI output storage — persists insight records to Gold Iceberg table."""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from src.storage.output_store import AIOutputRecord

logger = logging.getLogger(__name__)


class TrinoOutputStore:
    """
    Persistent output store that writes AI insight records to a Gold
    Iceberg table via Trino INSERT.

    Falls back to in-memory storage if Trino is unavailable, so the
    service continues to function without persistence.

    Table schema (created automatically on first write):
        gold.ai_insight_outputs (
            id                VARCHAR,
            insight_type      VARCHAR,
            agreement_id      VARCHAR,
            asset_id          VARCHAR,
            input_data        VARCHAR,   -- JSON string
            llm_model         VARCHAR,
            output_text       VARCHAR,
            structured_output VARCHAR,   -- JSON string
            created_at        TIMESTAMP(6) WITH TIME ZONE
        )
    """

    DDL = """
    CREATE TABLE IF NOT EXISTS "{catalog}"."{schema}".ai_insight_outputs (
        id                VARCHAR,
        insight_type      VARCHAR,
        agreement_id      VARCHAR,
        asset_id          VARCHAR,
        input_data        VARCHAR,
        llm_model         VARCHAR,
        output_text       VARCHAR,
        structured_output VARCHAR,
        created_at        TIMESTAMP(6) WITH TIME ZONE
    )
    WITH (format = 'PARQUET', location = '{location}')
    """

    def __init__(
        self,
        *,
        trino_config: Any,
        catalog: str = "fap-iotai-stackable",
        schema: str = "gold",
        s3_bucket: str = "fap-iotai-stackable",
    ) -> None:
        self._trino_config = trino_config
        self._catalog = catalog
        self._schema = schema
        self._s3_bucket = s3_bucket
        self._table_created = False
        # In-memory fallback
        self._by_id: dict[str, AIOutputRecord] = {}
        self._latest_by_type: dict[str, AIOutputRecord] = {}

    def _connect(self) -> Any:
        """Create a Trino connection using the same pattern as TrinoQueryClient."""
        import trino
        from trino.auth import JWTAuthentication

        # Reuse OIDC token fetch if configured, otherwise basic auth
        if self._trino_config.oidc_token_url:
            import requests

            form = {
                "grant_type": "password",
                "client_id": self._trino_config.oidc_client_id,
                "client_secret": self._trino_config.oidc_client_secret,
                "username": self._trino_config.oidc_username,
                "password": self._trino_config.oidc_password,
            }
            if self._trino_config.oidc_scope:
                form["scope"] = self._trino_config.oidc_scope

            resp = requests.post(
                self._trino_config.oidc_token_url,
                data=form,
                timeout=20,
            )
            resp.raise_for_status()
            token = resp.json()["access_token"]
            auth = JWTAuthentication(token)
        else:
            auth = None

        return trino.dbapi.connect(
            host=self._trino_config.host,
            port=self._trino_config.port,
            user=self._trino_config.user,
            catalog=self._catalog,
            schema=self._schema,
            http_scheme=self._trino_config.http_scheme,
            auth=auth,
        )

    def _ensure_table(self) -> None:
        """Create the output table if it doesn't exist."""
        if self._table_created:
            return
        location = f"s3a://{self._s3_bucket}/warehouse/{self._schema}.db/ai_insight_outputs"
        sql = self.DDL.format(
            catalog=self._catalog,
            schema=self._schema,
            location=location,
        )
        conn = None
        try:
            conn = self._connect()
            cursor = conn.cursor()
            try:
                cursor.execute(sql)
                cursor.fetchall()
            finally:
                cursor.close()
            self._table_created = True
            logger.info("ai_insight_outputs table ensured")
        except Exception as e:
            logger.warning("Could not create ai_insight_outputs table: %s", e)
        finally:
            if conn is not None:
                conn.close()

    def save(
        self,
        *,
        insight_type: str,
        agreement_id: str,
        asset_id: str,
        input_data: dict[str, Any],
        llm_model: str,
        output_text: str,
        structured_output: dict[str, Any],
    ) -> AIOutputRecord:
        """Save an insight record to Trino and in-memory cache."""
        record = AIOutputRecord(
            id=str(uuid4()),
            insight_type=insight_type,
            agreement_id=agreement_id,
            asset_id=asset_id,
            input_data=deepcopy(input_data),
            llm_model=llm_model,
            output_text=output_text,
            structured_output=deepcopy(structured_output),
            timestamp=datetime.now(UTC),
        )

        # Always update in-memory cache for fast latest queries
        self._by_id[record.id] = record
        self._latest_by_type[insight_type] = record

        # Persist to Trino (best-effort — don't fail the request)
        try:
            self._ensure_table()
            self._insert_record(record)
        except Exception as e:
            logger.warning(f"Failed to persist output to Trino: {e}")

        return record

    def _insert_record(self, record: AIOutputRecord) -> None:
        """INSERT a record into the Trino Gold table using parameterized queries."""
        input_json = json.dumps(record.input_data, default=str)
        output_json = json.dumps(record.structured_output, default=str)
        ts = record.timestamp.isoformat()

        sql = (
            f'INSERT INTO "{self._catalog}"."{self._schema}".ai_insight_outputs '
            f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, TIMESTAMP ?)"
        )
        params = (
            record.id,
            record.insight_type,
            record.agreement_id,
            record.asset_id,
            input_json,
            record.llm_model,
            record.output_text,
            output_json,
            ts,
        )

        conn = self._connect()
        cursor = conn.cursor()
        try:
            cursor.execute(sql, params)
            cursor.fetchall()
        finally:
            cursor.close()
            conn.close()

    def get(self, output_id: str) -> AIOutputRecord | None:
        """Get a record by ID (from in-memory cache)."""
        record = self._by_id.get(output_id)
        return deepcopy(record) if record else None

    def latest_for_types(
        self, insight_types: tuple[str, ...]
    ) -> dict[str, AIOutputRecord | None]:
        """Get the latest record for each insight type (from in-memory cache)."""
        return {
            insight_type: deepcopy(self._latest_by_type.get(insight_type))
            for insight_type in insight_types
        }
