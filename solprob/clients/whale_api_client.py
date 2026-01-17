# clients/whale_api_client.py
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from core.config import get_settings
from models.whale import IntervalLiteral
from services.whale_provider import WhaleProviderError


class WhaleAPIClient:
    """
    Thin wrapper around the upstream whale data API (AssetDash / Moby).

    You only change THIS file when their external schema changes.
    """

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.WHALE_API_BASE_URL:
            raise RuntimeError("WHALE_API_BASE_URL must be set when using remote provider")

        self._client = httpx.AsyncClient(
            base_url=str(settings.WHALE_API_BASE_URL),
            timeout=settings.WHALE_API_TIMEOUT_SECONDS,
        )
        self._api_key = settings.WHALE_API_KEY
        self._max_retries = settings.WHALE_API_MAX_RETRIES

    async def fetch_flows(
        self,
        token_address: str,
        interval: IntervalLiteral,
        start: datetime | None,
        end: datetime | None,
        limit: int | None,
    ) -> list[dict[str, Any]]:
        """
        Call the remote whale API and return raw JSON objects.

        TODO: Wire this to the actual AssetDash endpoint path and param names
              once they send you the spec.
        """
        params: dict[str, Any] = {
            "interval": interval,
        }
        if start:
            params["start"] = start.isoformat()
        if end:
            params["end"] = end.isoformat()
        if limit is not None:
            params["limit"] = limit

        headers: dict[str, str] = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        last_exc: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                # EXAMPLE PATH -> adjust to match their API
                resp = await self._client.get(
                    f"/v1/token/{token_address}/whale-flows",
                    params=params,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()

                # Here we assume their response has a top-level "data" list.
                # Change this once you have the real shape.
                if isinstance(data, dict) and "data" in data:
                    items = data["data"]
                else:
                    items = data

                if not isinstance(items, list):
                    raise WhaleProviderError("Unexpected response format from whale API")

                return items

            except (httpx.HTTPError, ValueError) as exc:
                last_exc = exc
                # simple backoff, could be improved
                # (for now we just retry synchronously)
                continue

        raise WhaleProviderError(f"Failed to fetch whale flows from remote API: {last_exc}")
