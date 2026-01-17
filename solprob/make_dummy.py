import pandas as pd, numpy as np
from datetime import datetime, timedelta, timezone

N = 4000  # ~4000 hours (~166 days) -> more samples
t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
ts = [t0 + timedelta(hours=i) for i in range(N)]

rng = np.random.default_rng(7)

# Higher hourly vol + occasional jumps
mu = 0.0000
sigma = 0.06            # was ~0.005; crank it up
rets = rng.normal(mu, sigma, size=N)

# Add upward and downward jumps (Poisson arrivals)
jump_prob = 0.02        # 2% of hours jump
jumps = (rng.random(N) < jump_prob)
jump_sizes = rng.choice([0.25, 0.4, -0.3, -0.5], size=N, p=[0.35, 0.15, 0.35, 0.15])
rets = rets + jumps * jump_sizes

# Price path
price = 0.1 * np.exp(np.cumsum(rets))
openp = np.r_[price[0], price[:-1]]

# OHLC bounds around open/close (keep plausible)
high  = np.maximum.reduce([openp, price * (1 + np.abs(rng.normal(0.03, 0.02, size=N))), price])
low   = np.minimum.reduce([openp, price * (1 - np.abs(rng.normal(0.03, 0.02, size=N))), price])
vol   = (rng.integers(5_000, 80_000, size=N) * (1 + rng.normal(0, 0.35, size=N))).clip(1000, None).astype(int)

df = pd.DataFrame({
    "timestamp": ts,
    "open": openp,
    "high": high,
    "low": low,
    "close": price,
    "volume": vol
})

out = r".\data\MY_TOKEN.csv"
df.to_csv(out, index=False)
print(f"Wrote {out} with {len(df)} rows")
