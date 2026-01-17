# services/remote_whale_provider.py
from __future__ import annotations

from datetime import datetime
from typing import List, Any

from clients.whale_api_client import WhaleAPIClient
from models.whale import IntervalLiteral, WhaleFlowPoint
from services.whale_provider import WhaleDataProvider, WhaleProviderError


class RemoteWhaleProvider(WhaleDataProvider):
    """
    Implementation that pulls data from the external whale API.

    All remote specifics live here + in WhaleAPIClient. The rest of your app
    doesn't need to know or care.
    """

    def __init__(self, client: WhaleAPIClient | None = None) -> None:
        self._client = client or WhaleAPIClient()

    async def get_flows(
        self,
        token_address: str,
        interval: IntervalLiteral,
        start: datetime | None,
        end: datetime | None,
        limit: int | None,
    ) -> List[WhaleFlowPoint]:
        raw_items: list[dict[str, Any]] = await self._client.fetch_flows(
            token_address=token_address,
            interval=interval,
            start=start,
            end=end,
            limit=limit,
        )

        flows: list[WhaleFlowPoint] = []

        for item in raw_items:
            try:
                # TODO: adjust field names based on THEIR actual JSON schema
                ts_raw = item.get("timestamp")
                if not ts_raw:
                    raise ValueError("Missing timestamp")

                # assume ISO8601 string
                ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))

                buy = float(item.get("whale_buy_volume_usd", 0.0))
                sell = float(item.get("whale_sell_volume_usd", 0.0))
                trades = int(item.get("whale_trades_count", 0))

                smart_wallet_flow = item.get("smart_wallet_flow_usd")
                unique_whales = item.get("unique_whales")
                net_flow = item.get("net_flow_usd")

                flows.append(
                    WhaleFlowPoint(
                        timestamp=ts,
                        whale_buy_volume_usd=buy,
                        whale_sell_volume_usd=sell,
                        whale_trades_count=trades,
                        smart_wallet_flow_usd=(
                            float(smart_wallet_flow)
                            if smart_wallet_flow is not None
                            else None
                        ),
                        unique_whales=int(unique_whales) if unique_whales is not None else None,
                        net_flow_usd=float(net_flow) if net_flow is not None else None,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                # You may want to log this and skip the bar instead of failing the whole response
                raise WhaleProviderError(f"Failed to parse whale flow item: {exc}") from exc

        return flows
