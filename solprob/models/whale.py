# models/whale.py
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

IntervalLiteral = Literal["1m", "5m", "15m", "1h"]


class WhaleFlowPoint(BaseModel):
    """
    Represents a single aggregated whale-flow bar.

    NOTE: This is the shape your API returns to AssetDash/Moby.
    It does NOT have to be the same as whatever their upstream whale API returns to you.
    """

    timestamp: datetime = Field(..., description="Start time of the bar in UTC")
    whale_buy_volume_usd: float = Field(..., ge=0)
    whale_sell_volume_usd: float = Field(..., ge=0)
    whale_trades_count: int = Field(..., ge=0)

    # optional / nice-to-have fields that your pipeline can compute
    smart_wallet_flow_usd: float | None = None
    unique_whales: int | None = None
    net_flow_usd: float | None = None  # buy - sell


class WhaleFlowsResponse(BaseModel):
    """
    Response body for GET /v1/token/{token_address}/whale-flows
    """

    token_address: str
    interval: IntervalLiteral
    whale_flows: list[WhaleFlowPoint]


class WhaleFlowsQuery(BaseModel):
    """
    Parsed & validated query params for whale-flows endpoint.

    We keep this simple and do cross-field checks (like start < end)
    in the FastAPI route instead of using Pydantic validators,
    to avoid Pydantic v1/v2 validator API headaches.
    """

    interval: IntervalLiteral = "1h"
    start: datetime | None = None
    end: datetime | None = None
    limit: int | None = Field(100, ge=1, le=2000)
