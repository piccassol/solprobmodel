# services/whale_provider.py
from __future__ import annotations

from datetime import datetime
from typing import Protocol

from models.whale import IntervalLiteral, WhaleFlowPoint


class WhaleProviderError(Exception):
    """Raised when the whale provider cannot satisfy a request (upstream issue)."""


class WhaleDataProvider(Protocol):
    """
    Abstraction around the source of whale data.

    Your FastAPI route should only talk to this interface, never directly to HTTP, CSV, etc.
    """

    async def get_flows(
        self,
        token_address: str,
        interval: IntervalLiteral,
        start: datetime | None,
        end: datetime | None,
        limit: int | None,
    ) -> list[WhaleFlowPoint]:
        ...
