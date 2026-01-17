"""
tools_live.py - live data helpers for Dexscreener, Twitter, and Moby.

This replaces the previous tiny test file that did `from tools_live import twitter_recent_count`
(which caused a circular import and ModuleNotFoundError). It now provides the concrete
functions your app and backend import: dexscreener_search, dexscreener_token, summarize_dex,
twitter_recent_count, twitter_sentiment, moby_overview, and whale_flows.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional

import requests

# ---------------------------------------------------------------------------
# Dexscreener helpers
# ---------------------------------------------------------------------------

DEX_API_BASE = "https://api.dexscreener.com"


def _dex_score_pair(pair: Dict[str, Any]) -> tuple[float, float]:
    """Score a Dexscreener pair by liquidity + 24h volume for ranking."""
    liq = ((pair.get("liquidity") or {}).get("usd") or 0.0)
    vol = ((pair.get("volume") or {}).get("h24") or 0.0)
    return float(liq), float(vol)


def dexscreener_search(query: str, timeout: float = 5.0) -> Dict[str, Any]:
    """
    Search Dexscreener for a query string (symbol, address, etc.).
    Wraps GET /latest/dex/search?q=...
    """
    url = f"{DEX_API_BASE}/latest/dex/search"
    try:
        resp = requests.get(url, params={"q": query}, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        # Ensure we always return dict with "pairs" key.
        if not isinstance(data, dict):
            return {"pairs": []}
        data.setdefault("pairs", [])
        return data
    except Exception as e:
        return {"error": f"Dexscreener search failed: {e}", "pairs": []}


def dexscreener_token(
    token_address: str,
    chain_id: str = "solana",
    timeout: float = 5.0,
) -> Dict[str, Any]:
    """
    Fetch a token snapshot from Dexscreener's /tokens/v1/{chainId}/{tokenAddresses} endpoint.
    Defaults to Solana; adjust chain_id if needed (e.g. 'ethereum', 'bsc', etc.).
    """
    if not token_address:
        return {"error": "token_address required", "pairs": []}

    url = f"{DEX_API_BASE}/tokens/v1/{chain_id}/{token_address}"
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        data = resp.json() or []
        if not isinstance(data, list) or not data:
            return {"pairs": []}
        # The token endpoint returns a list of pair-like objects; wrap them in "pairs".
        return {"pairs": data}
    except Exception as e:
        return {"error": f"Dexscreener token fetch failed: {e}", "pairs": []}


def _safe_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        return float(v)
    except Exception:
        return None


def _normalize_pair(pair: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a raw Dexscreener pair into the simplified structure used by the UI."""
    base = (pair.get("baseToken") or {})
    quote = (pair.get("quoteToken") or {})
    liq = ((pair.get("liquidity") or {}).get("usd"))
    vol24 = ((pair.get("volume") or {}).get("h24"))

    return {
        "chain": pair.get("chainId"),
        "dex": pair.get("dexId"),
        "pair": f"{base.get('symbol') or '?'} / {quote.get('symbol') or '?'}",
        "priceUsd": _safe_float(pair.get("priceUsd")),
        "liquidityUsd": liq,
        "vol24h": vol24,
        "fdv": pair.get("fdv") or pair.get("fdvUsd"),
        "mcap": pair.get("marketCap"),
        "raw": pair,
    }


def summarize_dex(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Given a Dexscreener response from either dexscreener_search() or dexscreener_token(),
    build a normalized dict with a "pairs" list that the Streamlit UI expects.
    """
    if not isinstance(data, dict):
        return {"pairs": []}

    raw_pairs: List[Dict[str, Any]] = []

    # If this already looks like a search result:
    if "pairs" in data and isinstance(data["pairs"], list):
        raw_pairs = data["pairs"]
    else:
        # Maybe it's a single snapshot dict
        raw_pairs = [data]

    normalized = [_normalize_pair(p) for p in raw_pairs]
    return {"pairs": normalized}


# ---------------------------------------------------------------------------
# Twitter helpers
# ---------------------------------------------------------------------------

TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")


def twitter_recent_count(
    query: str,
    window_minutes: int = 60,
    counts_only: bool = True,
    max_results: int = 50,
    pages: int = 1,
) -> Dict[str, Any]:
    """
    Fetch recent tweets matching a query from Twitter API v2.

    If TWITTER_BEARER_TOKEN is not set, returns a stubbed response so the rest of
    the app keeps working.
    """
    if not TWITTER_BEARER_TOKEN:
        # Stubbed fallback
        return {
            "query": query,
            "total_count": 0,
            "avg_per_minute": 0.0,
            "window_minutes": window_minutes,
            "stub": True,
        }

    url = "https://api.twitter.com/2/tweets/search/recent"
    headers = {"Authorization": f"Bearer {TWITTER_BEARER_TOKEN}"}
    total = 0
    tweets: List[Dict[str, Any]] = []
    next_token: Optional[str] = None
    page = 0

    while page < pages:
        params = {
            "query": query,
            "max_results": max(10, min(max_results, 100)),
            "tweet.fields": "created_at,lang,public_metrics",
        }
        if next_token:
            params["next_token"] = next_token

        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if resp.status_code != 200:
            break

        data = resp.json()
        meta = data.get("meta") or {}
        total += meta.get("result_count", 0)

        if not counts_only:
            for tw in data.get("data", []):
                tweets.append(
                    {
                        "id": tw.get("id"),
                        "text": tw.get("text"),
                        "created_at": tw.get("created_at"),
                        "lang": tw.get("lang"),
                        "public_metrics": tw.get("public_metrics"),
                    }
                )

        next_token = meta.get("next_token")
        page += 1
        if not next_token:
            break

    avg_per_minute = float(total) / float(window_minutes or 1)

    result: Dict[str, Any] = {
        "query": query,
        "total_count": total,
        "avg_per_minute": avg_per_minute,
        "window_minutes": window_minutes,
    }
    if not counts_only:
        result["tweets"] = tweets
    return result


def twitter_sentiment(
    query: str,
    max_results: int = 50,
    pages: int = 1,
) -> Dict[str, Any]:
    """
    Very simple sentiment stub built on top of twitter_recent_count.
    You can replace this later with a real model.
    """
    data = twitter_recent_count(
        query,
        window_minutes=60,
        counts_only=False,
        max_results=max_results,
        pages=pages,
    )
    tweets = data.get("tweets") or []
    total = len(tweets)

    # Stub: treat everything as neutral for now.
    sentiment = {
        "query": query,
        "total": total,
        "pos": 0,
        "neg": 0,
        "neu": total,
        "method": "stub",
    }
    return sentiment


# ---------------------------------------------------------------------------
# Moby + whale stubs
# ---------------------------------------------------------------------------


def moby_overview(url_or_query: str) -> Dict[str, Any]:
    """
    Placeholder Moby overview helper.

    Right now this just returns a stub. Once Moby exposes internal APIs,
    you can replace this to call their endpoints and reshape the response.
    """
    return {
        "source": "moby_stub",
        "input": url_or_query,
        "note": "Moby overview is not yet wired to a real API in this environment.",
    }


def whale_flows(query_or_contract: str) -> Dict[str, Any]:
    """
    Placeholder whale flows function.

    In production, this should query your real whale / smart money data source.
    For now, it returns a simple static structure so the rest of the pipeline
    can be exercised.
    """
    now_ms = int(time.time() * 1000)
    return {
        "token": query_or_contract,
        "net_usd_24h": 0.0,
        "buys_usd_24h": 0.0,
        "sells_usd_24h": 0.0,
        "unique_whales_24h": 0,
        "flow_history": [
            {"time": now_ms // 1000, "net_flow": 0.0},
        ],
        "commentary": "Whale flows not yet connected to a live data source in this environment.",
    }
