import sys, pandas as pd, numpy as np
from datetime import timezone

csv, horizon_hours, up_mult, dn_drop = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
df = pd.read_csv(csv)
df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
df = df.sort_values("timestamp").reset_index(drop=True)

# infer bar seconds
idx = pd.to_datetime(df["timestamp"], utc=True)
diffs = (idx.diff().dropna().dt.total_seconds()).to_numpy()
bar_sec = int(np.median(diffs)) if len(diffs) else 3600
horizon_bars = max(5, int((horizon_hours*3600)//bar_sec))

close, highs, lows = df["close"].to_numpy(), df["high"].to_numpy(), df["low"].to_numpy()
y = np.zeros(len(close), dtype=int)
for i in range(len(close)):
    j_end = min(len(close), i+1+horizon_bars)
    entry = close[i]
    up_thr = up_mult*entry
    dn_thr = (1.0-dn_drop)*entry
    up_when = dn_when = None
    for j in range(i+1, j_end):
        if up_when is None and highs[j] >= up_thr: up_when = j
        if dn_when is None and lows[j]  <= dn_thr: dn_when = j
        if up_when is not None or dn_when is not None: break
    y[i] = 1 if (up_when is not None and (dn_when is None or up_when < dn_when)) else 0

print(f"Bars: {len(df)}  |  bar_sec: {bar_sec}  |  horizon_bars: {horizon_bars}  |  pos_rate: {y.mean():.4f}")
