import os
import time
import requests
import pandas as pd

API_KEY = os.getenv("BIRDEYE_API_KEY")
if not API_KEY:
    raise SystemExit("Set BIRDEYE_API_KEY first")

url = "https://public-api.birdeye.so/defi/ohlcv"

# SOL mint
mint = "So11111111111111111111111111111111111111112"

# Use 1m candles, last 500 minutes
timeframe = "1m"
limit = 500
seconds_per_candle = 60

now = int(time.time())
time_to = now
time_from = now - limit * seconds_per_candle

params = {
    "address": mint,          # required
    "type": timeframe,        # 1m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 24h...
    "currency": "usd",
    "time_from": time_from,   # unix seconds
    "time_to": time_to,       # unix seconds
    "ui_amount_mode": "raw",
}

headers = {
    "accept": "application/json",
    "x-chain": "solana",
    "x-api-key": API_KEY,
}

print("Requesting:", url)
print("Params:", params)

resp = requests.get(url, headers=headers, params=params, timeout=15)
print("Status:", resp.status_code)
print("Body snippet:", resp.text[:400])

data = resp.json()
items = (data.get("data") or {}).get("items") or []
print("Num candles:", len(items))

if items:
    df = pd.DataFrame(items)
    # v1 uses unixTime (camelCase)
    df["timestamp"] = pd.to_datetime(df["unixTime"], unit="s", utc=True)
    df = df[["timestamp", "o", "h", "l", "c", "v"]]
    print(df.head())
