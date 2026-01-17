import os
import time
import requests
import pandas as pd

BIRDEYE_BASE = "https://public-api.birdeye.so"
BIRDEYE_API_KEY = os.getenv("BIRDEYE_API_KEY")


class OHLCVError(Exception):
    """Errors for Birdeye OHLCV fetching."""


def _seconds_per_candle(tf: str) -> int:
    """
    Map Birdeye OHLCV type string to seconds per candle.
    Supported timeframes are the ones listed in the v1 docs.
    """
    mapping = {
        "1m": 60,
        "5m": 5 * 60,
        "15m": 15 * 60,
        "30m": 30 * 60,
        "1h": 60 * 60,
        "2h": 2 * 60 * 60,
        "4h": 4 * 60 * 60,
        "8h": 8 * 60 * 60,
        "24h": 24 * 60 * 60,
    }
    if tf not in mapping:
        raise OHLCVError(f"Unsupported timeframe for v1 OHLCV: {tf}")
    return mapping[tf]


def fetch_ohlcv_birdeye(
    mint: str,
    timeframe: str = "1m",
    limit: int = 500,
    chain: str = "solana",
    currency: str = "usd",
) -> pd.DataFrame:
    """
    Fetch OHLCV candles for a Solana token from Birdeye /defi/ohlcv (v1).

    Uses a simple “last N candles” window:
      - time_to   = now
      - time_from = now - limit * seconds_per_candle(timeframe)

    Returns
    -------
    DataFrame with columns:
      timestamp (UTC), open, high, low, close, volume
    """
    if not BIRDEYE_API_KEY:
        raise OHLCVError(
            "BIRDEYE_API_KEY environment variable is not set.\n"
            "Get a Birdeye Data Services API key, then in PowerShell run:\n"
            '  $env:BIRDEYE_API_KEY = "YOUR_KEY_HERE"\n'
        )

    sec_per = _seconds_per_candle(timeframe)
    now = int(time.time())
    time_to = now
    time_from = now - limit * sec_per

    url = f"{BIRDEYE_BASE}/defi/ohlcv"

    headers = {
        "accept": "application/json",
        "x-chain": chain,
        "x-api-key": BIRDEYE_API_KEY,
    }

    params = {
        "address": mint,          # token mint
        "type": timeframe,        # 1m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 24h
        "currency": currency,
        "time_from": time_from,   # unix seconds
        "time_to": time_to,       # unix seconds
        "ui_amount_mode": "raw",
    }

    resp = requests.get(url, headers=headers, params=params, timeout=15)
    if resp.status_code != 200:
        raise OHLCVError(
            f"Birdeye OHLCV error {resp.status_code}: {resp.text[:300]}"
        )

    data = resp.json() or {}
    items = ((data.get("data") or {}).get("items") or [])
    if not items:
        raise OHLCVError(
            f"No candles returned for token {mint} timeframe={timeframe} "
            f"range=({time_from}, {time_to})"
        )

    rows = []
    for c in items:
        unix_time = c.get("unixTime")
        if unix_time is None:
            continue

        ts = pd.to_datetime(int(unix_time), unit="s", utc=True)
        o = float(c.get("o", 0.0))
        h = float(c.get("h", 0.0))
        l = float(c.get("l", 0.0))
        cl = float(c.get("c", 0.0))
        v = float(c.get("v", 0.0))

        rows.append(
            {
                "timestamp": ts,
                "open": o,
                "high": h,
                "low": l,
                "close": cl,
                "volume": v,
            }
        )

    df = pd.DataFrame(rows)
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def save_ohlcv_csv(
    mint: str,
    out_path: str,
    timeframe: str = "1m",
    limit: int = 500,
) -> str:
    """
    Fetch OHLCV from Birdeye and save as CSV compatible with solprob.py.

    Returns the path actually written.
    """
    df = fetch_ohlcv_birdeye(mint, timeframe=timeframe, limit=limit)
    df = df[["timestamp", "open", "high", "low", "close", "volume"]]

    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    df.to_csv(out_path, index=False)
    return out_path


if __name__ == "__main__":
    sol_mint = "So11111111111111111111111111111111111111112"
    csv_path = save_ohlcv_csv(
        mint=sol_mint,
        out_path="./data/sol_1m.csv",
        timeframe="1m",
        limit=2000,  # was 500; now ~33 hours of 1m data
    )
    print(f"Wrote OHLCV CSV to: {csv_path}")
