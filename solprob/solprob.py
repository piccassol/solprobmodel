#!/usr/bin/env python
# solprob.py — event-probability forecaster (local, CPU-friendly)
# Input CSV must include: timestamp,open,high,low,close,volume (timestamp parseable; UTC is ideal)

import argparse
import numpy as np
import pandas as pd
import requests

from sklearn.metrics import brier_score_loss
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedKFold
from xgboost import XGBClassifier

# -------------------------------------------------------------------
# MobyAI Trading metadata + risk helpers
# -------------------------------------------------------------------

AGENT_NAME = "MobyAI Trading"
ENGINE_VERSION = "v0.2"

DEX_API_BASE = "https://api.dexscreener.com"


def compute_kelly(p_up: float, up_mult: float, dn_drop: float) -> float:
    """
    Simple fractional Kelly for a binary 'up or down' event.

    Interprets:
      - p_up: probability that price hits +X% before -Y% within horizon
      - up_mult: e.g. 1.2 = +20% upside (b = up_mult - 1)
      - dn_drop: e.g. 0.10 = -10% downside (a = 0.10)

    Returns a Kelly fraction in [0, 1] (clamped), i.e. suggested fraction
    of capital to risk, *ignoring* fees/slippage. This is intended as a
    rough sizing hint for the UI / agent, not a full portfolio optimizer.
    """
    try:
        b = up_mult - 1.0  # upside multiple, e.g. 0.2 for +20%
        a = dn_drop        # downside fraction, e.g. 0.10
        if b <= 0 or a <= 0:
            return 0.0
        q = 1.0 - p_up
        edge = p_up * b - q * a
        denom = b * a
        if denom <= 0:
            return 0.0
        f = edge / denom
        return max(0.0, min(f, 1.0))
    except Exception:
        return 0.0


# -------------------------------------------------------------------
# Dexscreener live helpers
# -------------------------------------------------------------------

def _dex_score_pair(pair: dict):
    """Score a Dexscreener pair by liquidity + 24h volume for ranking."""
    liq = ((pair.get("liquidity") or {}).get("usd") or 0.0)
    vol = ((pair.get("volume") or {}).get("h24") or 0.0)
    return float(liq), float(vol)


def fetch_dexscreener_token_snapshot(
    chain_id: str,
    token_address: str,
    timeout: float = 5.0,
) -> dict | None:
    """
    Fetch a live token snapshot from Dexscreener's free API.

    Uses the /tokens/v1/{chainId}/{tokenAddresses} endpoint and selects the
    "best" pool by liquidity (then 24h volume). Returns a compact dict or
    None if nothing was found / request failed.
    """
    if not chain_id or not token_address:
        return None

    url = f"{DEX_API_BASE}/tokens/v1/{chain_id}/{token_address}"
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        return {"error": f"Dexscreener request failed: {e}"}

    if not data:
        return None

    # token API returns a list of pair-like objects
    try:
        best = max(data, key=_dex_score_pair)
    except Exception:
        best = data[0]

    vol = best.get("volume") or {}
    price_change = best.get("priceChange") or {}
    txns = best.get("txns") or {}
    tx_24h = txns.get("h24") or {}

    def _safe_float(v):
        try:
            return float(v)
        except Exception:  # noqa: BLE001
            return None

    return {
        "chainId": best.get("chainId"),
        "dexId": best.get("dexId"),
        "url": best.get("url"),
        "pairAddress": best.get("pairAddress"),
        "baseToken": best.get("baseToken"),
        "quoteToken": best.get("quoteToken"),
        "priceUsd": _safe_float(best.get("priceUsd")),
        "priceNative": best.get("priceNative"),
        "liquidityUsd": ((best.get("liquidity") or {}).get("usd")),
        "volume24hUsd": vol.get("h24"),
        "priceChange24hPct": price_change.get("h24"),
        "txns24h": {
            "buys": tx_24h.get("buys"),
            "sells": tx_24h.get("sells"),
        },
    }


def pretty_print_dex_snapshot(snapshot: dict):
    """Human-readable Dexscreener snapshot."""
    if not snapshot:
        print("[dex] No live Dexscreener data available for this token.")
        return
    if "error" in snapshot:
        print(f"[dex] Dexscreener error: {snapshot['error']}")
        return

    base = (snapshot.get("baseToken") or {})
    quote = (snapshot.get("quoteToken") or {})
    pair_label = f"{base.get('symbol') or '?'} / {quote.get('symbol') or '?'}"

    print("\n[dex] Live Dexscreener snapshot")
    print("-" * 70)
    print(
        f"Pair: {pair_label} on {snapshot.get('dexId') or 'N/A'} "
        f"({snapshot.get('chainId') or 'N/A'})"
    )
    if snapshot.get("url"):
        print(f"URL:  {snapshot['url']}")
    print(f"Price (USD):        {snapshot.get('priceUsd')!r}")
    print(f"Liquidity (USD):    {snapshot.get('liquidityUsd')!r}")
    print(f"Volume 24h (USD):   {snapshot.get('volume24hUsd')!r}")
    print(f"Price change 24h%:  {snapshot.get('priceChange24hPct')!r}")
    tx = snapshot.get("txns24h") or {}
    print(f"Txns 24h: buys={tx.get('buys')!r}, sells={tx.get('sells')!r}")
    print("-" * 70 + "\n")


# -------------------------------------------------------------------
# Feature engineering + labeling
# -------------------------------------------------------------------

def rsi(close: pd.Series, window=14):
    d = close.diff()
    up = d.clip(lower=0).rolling(window).mean()
    dn = (-d.clip(upper=0)).rolling(window).mean()
    rs = up / (dn + 1e-9)
    return 100 - (100 / (1 + rs))


def rolling_drawdown(close: pd.Series, window: int) -> pd.Series:
    rm = close.rolling(window).max()
    return (close / (rm + 1e-12) - 1.0).fillna(0.0)


def rolling_runup(close: pd.Series, window: int) -> pd.Series:
    rm = close.rolling(window).min()
    return (close / (rm + 1e-12) - 1.0).fillna(0.0)


def make_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ret_1"] = np.log(df["close"]).diff(1)
    for w in (3, 6, 12, 24, 48):
        df[f"ret_{w}"] = np.log(df["close"]).diff(w)
        df[f"vol_{w}"] = df["ret_1"].rolling(w).std()
        df[f"rsi_{w}"] = rsi(df["close"], w)
    for w in (6, 24, 48):
        df[f"volburst_{w}"] = np.log1p(df["volume"]) / (
            np.log1p(df["volume"]).rolling(w).mean() + 1e-9
        )
        df[f"hl_range_{w}"] = (
            df["high"].rolling(w).max() - df["low"].rolling(w).min()
        ) / (df["close"].rolling(w).mean() + 1e-9)
    for w in (24, 48):
        df[f"dd_{w}"] = rolling_drawdown(df["close"], w)
        df[f"ru_{w}"] = rolling_runup(df["close"], w)
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    return df.fillna(0.0).reset_index(drop=True)


def make_labels(df: pd.DataFrame, horizon_bars: int, up_mult: float, dn_drop: float):
    close, highs, lows = df["close"].to_numpy(), df["high"].to_numpy(), df["low"].to_numpy()
    y = np.zeros(len(close), dtype=int)
    for i in range(len(close)):
        j_end = min(len(close), i + 1 + horizon_bars)
        entry = close[i]
        up_thr = up_mult * entry
        dn_thr = (1.0 - dn_drop) * entry
        up_when = dn_when = None
        for j in range(i + 1, j_end):
            if up_when is None and highs[j] >= up_thr:
                up_when = j
            if dn_when is None and lows[j] <= dn_thr:
                dn_when = j
            if up_when is not None or dn_when is not None:
                break
        y[i] = 1 if (up_when is not None and (dn_when is None or up_when < dn_when)) else 0
    out = df.copy()
    out["label"] = y
    return out


def infer_bar_seconds(ts: pd.Series) -> int:
    idx = pd.to_datetime(ts, utc=True)
    diffs = (idx.diff().dropna().dt.total_seconds()).to_numpy()
    return int(np.median(diffs)) if len(diffs) else 60


def feature_columns(df: pd.DataFrame):
    drop = {"timestamp", "open", "high", "low", "close", "volume", "label"}
    return [c for c in df.columns if c not in drop]


def make_model(seed=42):
    return XGBClassifier(
        n_estimators=800,
        max_depth=6,
        learning_rate=0.03,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        random_state=seed,
        n_jobs=4,
        eval_metric="logloss",
        objective="binary:logistic",
        base_score=0.5,
        tree_method="hist",
    )


def walk_forward(df: pd.DataFrame, steps: int, calibration_method: str, seed: int = 42):
    n = len(df)
    step = n // (steps + 1)
    outputs, briers = [], []
    feats = feature_columns(df)
    for s in range(steps):
        split1 = (s + 1) * step
        split2 = min((s + 2) * step, n)
        train = df.iloc[:split1]
        valid = df.iloc[split1:split2]
        test = df.iloc[max(split2 - step, split1):split2]
        if len(train) < 200 or len(valid) < 100 or len(test) < 100:
            continue
        X_tr, y_tr = train[feats].to_numpy(), train["label"].astype(int).to_numpy()
        X_va, y_va = valid[feats].to_numpy(), valid["label"].astype(int).to_numpy()
        X_te, y_te = test[feats].to_numpy(), test["label"].astype(int).to_numpy()
        if len(np.unique(y_tr)) < 2 or len(np.unique(y_va)) < 2:
            continue
        base = make_model(seed)
        base.fit(X_tr, y_tr)
        X_trva = np.vstack([X_tr, X_va])
        y_trva = np.concatenate([y_tr, y_va])
        skf = StratifiedKFold(n_splits=3, shuffle=True, random_state=seed)
        calib = CalibratedClassifierCV(estimator=base, method=calibration_method, cv=skf)
        calib.fit(X_trva, y_trva)
        p_te = calib.predict_proba(X_te)[:, 1]
        briers.append(brier_score_loss(y_te, p_te))
        outputs.append(
            pd.DataFrame(
                {
                    "timestamp": test["timestamp"].values,
                    "close": test["close"].values,
                    "p_up": p_te,
                    "y": y_te,
                    "chunk": s,
                }
            )
        )
    if not outputs:
        raise RuntimeError("No qualifying folds. Adjust --steps / --horizon_hours / --up_mult.")
    return float(np.mean(briers)), pd.concat(outputs, ignore_index=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--horizon_hours", type=float, default=24.0)
    ap.add_argument("--up_mult", type=float, default=1.2)
    ap.add_argument("--dn_drop", type=float, default=0.10)
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--calibration", choices=["sigmoid", "isotonic"], default="sigmoid")
    ap.add_argument("--out", default="predictions.csv")

    # Optional: live Dexscreener snapshot for this token
    ap.add_argument("--dex_chain", help="Dexscreener chainId, e.g. solana", default=None)
    ap.add_argument("--dex_token", help="Dexscreener token address on that chain", default=None)
    ap.add_argument(
        "--dex_timeout",
        type=float,
        default=5.0,
        help="HTTP timeout in seconds for Dexscreener requests",
    )

    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    required = {"timestamp", "open", "high", "low", "close", "volume"}
    if not required.issubset(df.columns):
        raise ValueError(f"CSV missing required columns: {sorted(required)}")
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)

    bar_sec = infer_bar_seconds(df["timestamp"])
    horizon_bars = max(5, int((args.horizon_hours * 3600) // bar_sec))

    labeled = make_labels(df, horizon_bars=horizon_bars, up_mult=args.up_mult, dn_drop=args.dn_drop)
    feats = make_features(labeled)

    pos_rate = feats["label"].mean()
    print(f"[info] Positive rate over full sample: {pos_rate:.4f}")

    brier, out = walk_forward(feats, steps=args.steps, calibration_method=args.calibration)
    print(f"[info] Mean Brier score across folds: {brier:.4f}")

    bins = pd.cut(out["p_up"], bins=np.linspace(0, 1, 11), include_lowest=True)
    cal = (
        out.groupby(bins, observed=False)
        .agg(n=("y", "size"), p_hat=("p_up", "mean"), hit_rate=("y", "mean"))
        .reset_index()
    )

    print("\nCalibration (bin avg p vs realized hit rate):")
    with pd.option_context("display.max_rows", None, "display.width", 120):
        print(cal.to_string(index=False, float_format=lambda v: f"{v:0.3f}"))

    # ----------------------------------------------------------------
    # MobyAI Trading overlay: latest probability, EV, Kelly fraction
    # ----------------------------------------------------------------
    try:
        out_sorted = out.sort_values("timestamp")
        last_row = out_sorted.iloc[-1]
        last_p_up = float(last_row["p_up"])
        last_ts = last_row["timestamp"]
    except Exception:
        last_p_up = None
        last_ts = None

    if last_p_up is not None:
        kelly_f = compute_kelly(last_p_up, args.up_mult, args.dn_drop)
        ev_up = last_p_up * (args.up_mult - 1.0)
        ev_dn = (1.0 - last_p_up) * args.dn_drop
        net_ev = ev_up - ev_dn

        print("\n" + "=" * 70)
        print(f"{AGENT_NAME} — {ENGINE_VERSION}")
        if last_ts is not None:
            print(f"Latest bar: {last_ts}")
        print(
            f"Horizon: {args.horizon_hours:.1f}h  "
            f"| Upside: +{(args.up_mult - 1.0) * 100:.1f}%  "
            f"| Downside: -{args.dn_drop * 100:.1f}%"
        )
        print(f"Latest p_up: {last_p_up:.4f}")
        print(
            f"Expected value (per unit notional): {net_ev:.4f}  "
            f"(EV_up={ev_up:.4f}, EV_down={ev_dn:.4f})"
        )
        print(f"Kelly fraction (clamped 0–1): {kelly_f:.3f}")
        print("=" * 70 + "\n")

    # Optional: live Dexscreener overlay
    if args.dex_chain and args.dex_token:
        snapshot = fetch_dexscreener_token_snapshot(
            chain_id=args.dex_chain,
            token_address=args.dex_token,
            timeout=args.dex_timeout,
        )
        pretty_print_dex_snapshot(snapshot)

    out.to_csv(args.out, index=False)
    print(f"Saved per-bar probabilities to: {args.out}")
    print("Columns: timestamp, close, p_up, y, chunk")
    print("Note: MobyAI Trading agent / dashboards can consume this CSV directly.")


if __name__ == "__main__":
    main()
