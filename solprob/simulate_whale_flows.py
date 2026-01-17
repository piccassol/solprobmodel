Simulate bar-level whale / smart-money flows for a token.

Matches the tentative AssetDash schema:

{
  "token_address": "So111...pump",
  "interval": "1h",
  "whale_flows": [
    {
      "timestamp": "2025-01-01T00:00:00Z",
      "whale_buy_volume_usd": 54000.0,
      "whale_sell_volume_usd": 12000.0,
      "whale_trades_count": 14,
      "smart_wallet_flow_usd": 18000.0,
      "unique_whales": 5,
      "net_flow_usd": 42000.0
    }
  ]
}
"""

import argparse
import json
import math
import random
from datetime import datetime, timedelta, timezone
from typing import List, Dict


def parse_interval(interval: str) -> timedelta:
    mapping = {
        "1m": timedelta(minutes=1),
        "5m": timedelta(minutes=5),
        "15m": timedelta(minutes=15),
        "1h": timedelta(hours=1),
    }
    if interval not in mapping:
        raise ValueError(f"Unsupported interval: {interval}")
    return mapping[interval]


def generate_timestamps(
    start: datetime, end: datetime, interval: str
) -> List[datetime]:
    step = parse_interval(interval)
    ts = []
    cur = start
    while cur <= end:
        ts.append(cur)
        cur += step
    return ts


def simulate_whale_flows_for_window(
    token_address: str,
    start: datetime,
    end: datetime,
    interval: str = "1h",
    base_buy_intensity: float = 3.0,   # avg whale trades per bar
    trend_bias: float = 0.0            # >0 bias towards net buying, <0 toward selling
) -> Dict:
    """
    Simulate whale flows between start and end (inclusive).
    """
    timestamps = generate_timestamps(start, end, interval)
    flows = []

    for i, ts in enumerate(timestamps):
        # Poisson-like trade count approximation (no numpy)
        lam = max(0.1, base_buy_intensity * (1.0 + 0.2 * math.sin(i / 5.0)))
        # crude Poisson: sum of Bernoullis
        count = sum(1 for _ in range(20) if random.random() < lam / 20.0)

        if count == 0:
            flows.append({
                "timestamp": ts.replace(tzinfo=timezone.utc).isoformat(),
                "whale_buy_volume_usd": 0.0,
                "whale_sell_volume_usd": 0.0,
                "whale_trades_count": 0,
                "smart_wallet_flow_usd": 0.0,
                "unique_whales": 0,
                "net_flow_usd": 0.0,
            })
            continue

        # total volume ~ log-normal-ish
        total_vol = math.exp(random.normalvariate(math.log(10_000), 0.8))
        total_vol *= (0.5 + random.random())  # spread it a bit

        # buy vs sell split, with optional trend bias
        base_ratio = random.betavariate(2, 2)  # ~Uniform-ish around 0.5
        buy_ratio = min(1.0, max(0.0, base_ratio + trend_bias))

        whale_buy = total_vol * buy_ratio
        whale_sell = total_vol - whale_buy
        net_flow = whale_buy - whale_sell

        smart_wallet_flow = net_flow * (0.5 + 0.5 * random.random())
        unique_whales = max(1, int(count * (0.6 + 0.4 * random.random())))

        flows.append({
            "timestamp": ts.replace(tzinfo=timezone.utc).isoformat(),
            "whale_buy_volume_usd": float(whale_buy),
            "whale_sell_volume_usd": float(whale_sell),
            "whale_trades_count": int(count),
            "smart_wallet_flow_usd": float(smart_wallet_flow),
            "unique_whales": int(unique_whales),
            "net_flow_usd": float(net_flow),
        })

    return {
        "token_address": token_address,
        "interval": interval,
        "whale_flows": flows,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token_address", required=True)
    ap.add_argument("--interval", default="1h", choices=["1m", "5m", "15m", "1h"])
    ap.add_argument("--hours", type=float, default=48.0, help="Window size backwards from now")
    ap.add_argument("--trend_bias", type=float, default=0.0, help=">0 net buy, <0 net sell")
    ap.add_argument("--out", default=None, help="Output JSON file (default: stdout)")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=args.hours)

    data = simulate_whale_flows_for_window(
        args.token_address, start, now,
        interval=args.interval,
        trend_bias=args.trend_bias,
    )

    payload = json.dumps(data, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
    else:
        print(payload)


if __name__ == "__main__":
    main()
