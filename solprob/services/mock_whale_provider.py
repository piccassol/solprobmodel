# services/mock_whale_provider.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List

from models.whale import IntervalLiteral, WhaleFlowPoint
from services.whale_provider import WhaleDataProvider


_INTERVAL_TO_SECONDS: dict[IntervalLiteral, int] = {
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "1h": 60 * 60,
}


class MockWhaleProvider(WhaleDataProvider):
    """
    Simple mock provider that generates synthetic data.

    Good enough to:
    - unblock frontend integration
    - exercise the API and contracts
    """

    async def get_flows(
        self,
        token_address: str,
        interval: IntervalLiteral,
        start: datetime | None,
        end: datetime | None,
        limit: int | None,
    ) -> List[WhaleFlowPoint]:
        now = datetime.now(timezone.utc)

        if end is None:
            end = now
        if start is None:
            seconds = _INTERVAL_TO_SECONDS[interval]
            # by default, generate `limit` bars back from `end`
            bars = limit or 100
            start = end - timedelta(seconds=seconds * bars)

        seconds = _INTERVAL_TO_SECONDS[interval]
        max_bars = limit or 100

        points: list[WhaleFlowPoint] = []
        current = start

        i = 0
        while current < end and i < max_bars:
            buy = 10_000.0 + i * 100.0
            sell = 2_000.0 + i * 50.0
            net = buy - sell

            points.append(
                WhaleFlowPoint(
                    timestamp=current,
                    whale_buy_volume_usd=buy,
                    whale_sell_volume_usd=sell,
                    whale_trades_count=5 + i % 3,
                    smart_wallet_flow_usd=net * 0.3,
                    unique_whales=3 + (i % 4),
                    net_flow_usd=net,
                )
            )

            current += timedelta(seconds=seconds)
            i += 1

        return points
