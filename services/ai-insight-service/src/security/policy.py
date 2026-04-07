"""Policy checks for agreement/asset/role-based access with table/column ABAC."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from src.config import PolicyConfig


class PolicyDeniedError(Exception):
    """Raised when policy checks fail."""


@dataclass(frozen=True)
class AccessContext:
    """Identity and scope values extracted from request headers."""

    agreement_id: str
    asset_id: str
    roles: tuple[str, ...]


class PolicyEnforcer:
    """Header-driven policy enforcement with table/column-level ABAC."""

    def __init__(self, config: PolicyConfig) -> None:
        self._config = config

    def build_context(self, headers: Mapping[str, str]) -> AccessContext:
        agreement_id = headers.get(self._config.agreement_header, "").strip()
        asset_id = headers.get(self._config.asset_header, "").strip()
        raw_roles = headers.get(self._config.role_header, "")
        roles = tuple(role.strip() for role in raw_roles.split(",") if role.strip())
        return AccessContext(agreement_id=agreement_id, asset_id=asset_id, roles=roles)

    def enforce(self, context: AccessContext) -> None:
        if not self._config.enabled:
            return
        if not context.agreement_id:
            raise PolicyDeniedError("Missing agreement identifier")
        if not context.asset_id:
            raise PolicyDeniedError("Missing asset identifier")

        if self._config.required_roles:
            required = set(self._config.required_roles)
            present = set(context.roles)
            if required.isdisjoint(present):
                raise PolicyDeniedError("Missing required role")

        if self._config.allowed_agreement_ids:
            allowed_agreements = set(self._config.allowed_agreement_ids)
            if context.agreement_id not in allowed_agreements:
                raise PolicyDeniedError("Agreement is not authorized")

        if self._config.allowed_asset_ids:
            allowed_assets = set(self._config.allowed_asset_ids)
            if context.asset_id not in allowed_assets:
                raise PolicyDeniedError("Asset is not authorized")

    # -----------------------------------------------------------------
    # Table / Column-level ABAC
    # -----------------------------------------------------------------

    def allowed_tables(self, context: AccessContext) -> set[str] | None:
        """
        Return the set of tables accessible to the given roles.

        Returns None if no restrictions are configured (all tables allowed).
        Returns an empty set if the role has no table access.
        """
        if not self._config.role_table_access:
            return None  # No restrictions configured

        tables: set[str] = set()
        for role in context.roles:
            role_access = self._config.role_table_access.get(role, {})
            tables.update(role_access.keys())
        return tables

    def allowed_columns(self, context: AccessContext, table: str) -> list[str] | None:
        """
        Return the list of columns accessible for a given table and roles.

        Returns None if no restrictions are configured (all columns allowed).
        Returns an empty list if the role cannot access this table.
        """
        if not self._config.role_table_access:
            return None  # No restrictions configured

        columns: set[str] = set()
        for role in context.roles:
            role_access = self._config.role_table_access.get(role, {})
            table_columns = role_access.get(table)
            if table_columns:
                columns.update(table_columns)
        return list(columns) if columns else []

    def enforce_table_access(self, context: AccessContext, table: str) -> None:
        """Raise PolicyDeniedError if the context cannot access the given table."""
        tables = self.allowed_tables(context)
        if tables is not None and table not in tables:
            raise PolicyDeniedError(f"Access denied to table: {table}")

    def filter_columns(
        self, context: AccessContext, table: str, requested_columns: list[str]
    ) -> list[str]:
        """
        Filter requested columns to only those allowed by policy.

        Returns the full requested list if no restrictions are configured.
        """
        allowed = self.allowed_columns(context, table)
        if allowed is None:
            return requested_columns
        allowed_set = set(allowed)
        return [col for col in requested_columns if col in allowed_set]
