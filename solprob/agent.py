# agent.py — strict local analyst using Ollama + tools + your probability model
import argparse
import json
import subprocess
import re
from ollama import chat
import tools_live as tools

# NEW: import OHLCV fetcher
from ohlc_fetcher import save_ohlcv_csv, OHLCVError


def run_prob_model(
    pyfile: str,
    csv_path: str,
    horizon_hours: float = 24,
    up_mult: float = 1.2,
    dn_drop: float = 0.10,
    steps: int = 4,
    out_csv: str = "preds_latest.csv",
    calibration: str = "isotonic",
):
    """Run your probability script; read last prob from CSV; best-effort Brier parse."""
    import pandas as pd

    cmd = [
        "python",
        pyfile,
        "--csv",
        csv_path,
        "--horizon_hours",
        str(horizon_hours),
        "--up_mult",
        str(up_mult),
        "--dn_drop",
        str(dn_drop),
        "--steps",
        str(steps),
        "--calibration",
        calibration,
        "--out",
        out_csv,
    ]
    # solprob.py can also be given --dex_chain/--dex_token by a higher-level orchestrator
    proc = subprocess.run(cmd, capture_output=True, text=True)
    stdout, stderr = proc.stdout, proc.stderr

    try:
        df = pd.read_csv(out_csv)
    except Exception as e:  # noqa: BLE001
        return {"error": f"prob model failed: {stderr or stdout or str(e)}"}

    if len(df) == 0:
        return {"error": f"prob model produced empty CSV. Logs:\n{stderr or stdout}"}

    last = df.iloc[-1].to_dict()
    last_prob = float(last.get("p_up", 0.0))

    brier = None
    for line in (stdout or "").splitlines():
        if "Brier" in line:
            m = re.search(r"([0-9]*\.[0-9]+)", line)
            if m:
                try:
                    brier = float(m.group(1))
                    break
                except Exception:  # noqa: BLE001
                    pass

    return {
        "brier": brier,
        "last_prob": last_prob,
        "last_row": last,
        "out_csv": out_csv,
        "stdout": stdout,
        "stderr": stderr,
        "returncode": proc.returncode,
    }


def strict_brief(facts: dict, model_tag: str):
    """
    Quant-style brief using ONLY the provided facts.

    Explicitly covers:
      - Whale flow (if whale_flow data is present)
      - X (Twitter) social sentiment, from tweets/x_sentiment
    """
    system = (
        "You are a quantitative crypto analyst. Use ONLY the provided facts. "
        "If any field is None or missing, write 'N/A'. Never invent values. "
        "Use 'edge_prelim' exactly as given and do not override it. "
        "Avoid qualitative adjectives; report numeric values and 'N/A' only. "
        "If whale_flow or x_sentiment fields are present, summarize them "
        "concisely without adding new data."
    )
    prompt = (
        "FACTS (JSON):\n"
        + json.dumps(facts, indent=2)
        + "\n\n"
        "Write a brief with sections:\n"
        "Token: (base/base_name if available)\n"
        "P(+X% before -Y% in T h): <probability>\n"
        "Model: Brier=<brier>, last_ts=<timestamp>\n"
        "Dexscreener (top pair): priceUsd, liquidityUsd, vol24h, fdv/mcap, chain/dex\n"
        "Whale flow: summarize whale_flow if present (e.g., large buyer/seller activity);\n"
        "             otherwise 'N/A'. Do not invent whale data.\n"
        "X sentiment: summarize x_sentiment or tweets fields as social activity/sentiment\n"
        "             on X (Twitter); if you only have counts, report them factually.\n"
        "Tweets: total, tweets_per_hour, window_minutes\n"
        "Moby (parsed): market_cap_text, liquidity_text, volume24h_text, holders_text\n"
        "Conclusion: one sentence that matches edge_prelim (do not imply more confidence "
        "than the probability).\n"
        "Edge: <use edge_prelim exactly>\n"
        "Risks:\n- item1\n- item2\n"
    )
    resp = chat(
        model=model_tag,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return resp["message"]["content"]


def user_synopsis(facts: dict, model_tag: str):
    """
    End-user synopsis (dashboard copy).

    Explicitly talks about:
      - Whale flow
      - Social sentiment on X
    """
    system = (
        "You write short, neutral, risk-aware summaries of crypto tokens "
        "for retail users on a dashboard. "
        "Use ONLY the provided JSON facts. Do NOT invent prices, volumes, or narratives. "
        "Highlight missing data, uncertainty, and liquidity risk. "
        "Never give financial advice or tell users to buy, sell, or hold. "
        "You may describe the setup as relatively favorable / neutral / unfavorable "
        "based ONLY on edge_prelim and the numeric data, but do not give directives."
    )
    prompt = (
        "Here is a JSON snapshot with model outputs and market data:\n"
        + json.dumps(facts, indent=2)
        + "\n\n"
        "Write 3–5 short paragraphs:\n"
        "1) One-sentence overall view of the setup, referencing edge_prelim (favorable, "
        "neutral, or unfavorable) without telling the user to trade.\n"
        "2) Explain the probability and what it means in plain language.\n"
        "3) Comment on liquidity, volume, and whale flow: use dexscreener_top_pair and "
        "whale_flow if present. If whale_flow is missing or limited, say that explicitly.\n"
        "4) Describe social sentiment and activity on X (Twitter) based on tweets/x_sentiment "
        "fields. If you only have counts, talk about activity level, not opinion; if you "
        "have explicit sentiment scores, you may summarize them.\n"
        "5) Call out key risks and uncertainty (thin liquidity, high volatility, unknown "
        "contract risk, missing data). End with exactly this sentence: "
        "'This is not financial advice. Crypto assets are highly volatile.'\n"
        "Do not use headings or bullet points; just paragraphs."
    )
    resp = chat(
        model=model_tag,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return resp["message"]["content"]


def _filter_best_pair(
    pairs,
    min_liquidity_usd=None,
    min_vol24h_usd=None,
    prefer_chain=None,
    require_quote=None,
):
    """Filter/sort Dex pairs; return best one or None."""
    if not pairs:
        return None
    rows = list(pairs)
    if min_liquidity_usd is not None:
        rows = [
            r
            for r in rows
            if (r.get("liquidityUsd") or 0.0) >= float(min_liquidity_usd)
        ]
    if min_vol24h_usd is not None:
        rows = [r for r in rows if (r.get("vol24h") or 0.0) >= float(min_vol24h_usd)]
    if require_quote:
        rq = str(require_quote).upper()
        rows = [r for r in rows if str(r.get("quote") or "").upper() == rq]
    rows.sort(
        key=lambda r: (
            (r.get("liquidityUsd") or 0.0),
            (r.get("vol24h") or 0.0),
        ),
        reverse=True,
    )
    if prefer_chain:
        pc = str(prefer_chain).lower()
        for r in rows:
            if str(r.get("chain") or "").lower() == pc:
                return r
    return rows[0] if rows else None


def run_agent(args):
    """
    Core orchestration for CLI / HTTP.

    Returns dict with:
      - facts
      - edge_prelim
      - trade_brief
      - user_synopsis
      - raw (prob model, dex, tweets, x_sentiment, whale_flow, moby)
    """
    # 1) Probability model (optional if we have a CSV)
    if getattr(args, "csv", None):
        model_out = run_prob_model(
            args.pyfile,
            args.csv,
            args.horizon_hours,
            args.up_mult,
            args.dn_drop,
            args.steps,
            "preds_latest.csv",
            args.calibration,
        )
    else:
        model_out = {
            "error": "No CSV available for probability model (OHLCV fetch may have failed or was not requested)."
        }

    # 2) Dexscreener
    dex_raw = dex_sum = None
    try:
        if getattr(args, "dex_address", None):
            dex_raw = tools.dexscreener_token(args.dex_address)
        elif getattr(args, "dex_query", None):
            dex_raw = tools.dexscreener_search(args.dex_query)
        dex_sum = tools.summarize_dex(dex_raw) if dex_raw else None
    except Exception as e:  # noqa: BLE001
        dex_sum = {"error": str(e)}

    pairs = (dex_sum or {}).get("pairs") if isinstance(dex_sum, dict) else None
    top_pair = _filter_best_pair(
        pairs or [],
        min_liquidity_usd=getattr(args, "min_liquidity_usd", None),
        min_vol24h_usd=getattr(args, "min_vol24h_usd", None),
        prefer_chain=getattr(args, "prefer_chain", None),
        require_quote=getattr(args, "require_quote", None),
    )

    # 3) Tweets / X activity
    tw_sum = None
    if getattr(args, "tweet_query", None):
        try:
            tw_sum = tools.twitter_recent_count(
                args.tweet_query,
                max_results=args.tweet_max_results,
                pages=args.tweet_pages,
                window_minutes=args.tweet_window_minutes,
                counts_only=args.tweet_counts_only,
            )
        except Exception as e:  # noqa: BLE001
            tw_sum = {"error": str(e)}

    # 3b) Social sentiment on X (optional extra tool)
    x_sentiment = None
    if getattr(args, "tweet_query", None) and hasattr(tools, "twitter_sentiment"):
        try:
            x_sentiment = tools.twitter_sentiment(
                args.tweet_query,
                window_minutes=args.tweet_window_minutes,
                max_results=args.tweet_max_results,
                pages=args.tweet_pages,
            )
        except Exception as e:  # noqa: BLE001
            x_sentiment = {"error": str(e)}

    # 3c) Whale flow / whale wallets (optional extra tool)
    whale_flow = None
    whale_address = getattr(args, "whale_address", None) or getattr(args, "dex_address", None)
    if whale_address and hasattr(tools, "whale_flow"):
        try:
            whale_flow = tools.whale_flow(whale_address)
        except Exception as e:  # noqa: BLE001
            whale_flow = {"error": str(e)}

    # 4) Moby
    moby_sum = None
    if getattr(args, "moby_url", None):
        try:
            moby_sum = tools.moby_overview(args.moby_url)
        except Exception as e:  # noqa: BLE001
            moby_sum = {"error": str(e)}

    # 5) Edge label
    p = None if "error" in model_out else model_out["last_prob"]
    if p is None:
        edge_prelim = "N/A"
    else:
        edge_prelim = "Present" if p >= 0.65 else ("Marginal" if p >= 0.50 else "Absent")

    # 6) Facts snapshot for LLM + UI
    target = f"+{round(args.up_mult * 100 - 100)}% before -{int(args.dn_drop * 100)}% in {int(args.horizon_hours)}h"
    facts = {
        "target": target,
        "edge_prelim": edge_prelim,
        "model": {
            "probability": None if "error" in model_out else round(model_out["last_prob"], 4),
            "brier": None if "error" in model_out else model_out.get("brier"),
            "last_row": None if "error" in model_out else model_out.get("last_row"),
            "error": model_out.get("error"),
        },
        "dexscreener_top_pair": top_pair,
        "tweets": tw_sum,
        "x_sentiment": x_sentiment,
        "whale_flow": whale_flow,
        "moby": moby_sum,
    }

    # 7) LLM summaries
    try:
        trade_brief = strict_brief(facts, args.model_tag)
    except Exception as e:  # noqa: BLE001
        trade_brief = f"(LLM error in strict_brief: {e})\n\nFallback facts:\n{json.dumps(facts, indent=2)}"

    try:
        synopsis = user_synopsis(facts, args.model_tag)
    except Exception as e:  # noqa: BLE001
        synopsis = f"(LLM error in user_synopsis: {e})"

    return {
        "facts": facts,
        "edge_prelim": edge_prelim,
        "trade_brief": trade_brief,
        "user_synopsis": synopsis,
        "raw": {
            "prob_model": model_out,
            "dex": dex_sum,
            "tweets": tw_sum,
            "x_sentiment": x_sentiment,
            "whale_flow": whale_flow,
            "moby": moby_sum,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pyfile", default="solprob.py", help="probability model script filename")

    # CSV OR mint (auto-fetch)
    ap.add_argument(
        "--csv",
        help="Path to existing OHLCV CSV. If omitted, --mint is required and OHLCV will be fetched via Birdeye.",
        default=None,
    )
    ap.add_argument(
        "--mint",
        help="Token mint address; if provided (and --csv is not), agent will fetch OHLCV via Birdeye and build a CSV.",
        default=None,
    )
    ap.add_argument(
        "--timeframe",
        help="Birdeye OHLCV timeframe (v1 /defi/ohlcv type), e.g. 1m, 5m, 15m, 1h.",
        default="1m",
    )
    ap.add_argument(
        "--limit",
        type=int,
        help="Number of candles to request when auto-fetching OHLCV (via --mint).",
        default=500,
    )

    # Dex
    ap.add_argument("--dex_query")
    ap.add_argument("--dex_address")
    ap.add_argument("--min_liquidity_usd", type=float, default=None)
    ap.add_argument("--min_vol24h_usd", type=float, default=None)
    ap.add_argument("--prefer_chain", default=None)
    ap.add_argument("--require_quote", default=None)

    # Whale flow
    ap.add_argument(
        "--whale_address",
        help="Token or pool address used for whale-flow analytics (if tools.whale_flow is available)",
        default=None,
    )

    # Moby
    ap.add_argument("--moby_url")

    # Tweets / X
    ap.add_argument("--tweet_query")
    ap.add_argument("--tweet_max_results", type=int, default=50)
    ap.add_argument("--tweet_pages", type=int, default=1)
    ap.add_argument("--tweet_window_minutes", type=int, default=60)
    ap.add_argument("--tweet_counts_only", action="store_true", default=False)

    # Prob model
    ap.add_argument("--horizon_hours", type=float, default=24.0)
    ap.add_argument("--up_mult", type=float, default=1.2)
    ap.add_argument("--dn_drop", type=float, default=0.10)
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--calibration", choices=["sigmoid", "isotonic"], default="isotonic")

    # LLM
    ap.add_argument("--model_tag", default="llama3.2:3b")

    # Output mode
    ap.add_argument(
        "--json_out",
        action="store_true",
        help="print machine-readable JSON instead of human text brief",
    )

    args = ap.parse_args()

    # If CSV is not provided, but mint is, auto-fetch OHLCV and build CSV
    if not args.csv:
        if not args.mint:
            ap.error("You must provide either --csv or --mint.")
        safe_mint = re.sub(r"[^A-Za-z0-9]", "_", args.mint)
        out_path = f"./data/{safe_mint[:8]}_{args.timeframe}.csv"
        try:
            print(
                f"[agent] No --csv provided. Fetching OHLCV via Birdeye for mint={args.mint}, "
                f"timeframe={args.timeframe}, limit={args.limit}..."
            )
            csv_path = save_ohlcv_csv(
                mint=args.mint,
                out_path=out_path,
                timeframe=args.timeframe,
                limit=args.limit,
            )
            print(f"[agent] Wrote OHLCV CSV to: {csv_path}")
            args.csv = csv_path
        except OHLCVError as e:
            print(f"[agent] OHLCV fetch failed for mint {args.mint}: {e}")
            args.csv = None
        except Exception as e:  # noqa: BLE001
            print(f"[agent] Unexpected error during OHLCV fetch for mint {args.mint}: {e}")
            args.csv = None

    result = run_agent(args)

    if args.json_out:
        print(json.dumps(result, indent=2, default=str))
    else:
        print("\n===== TRADE BRIEF =====\n")
        print(result["trade_brief"])
        print("\n===== USER SYNOPSIS =====\n")
        print(result["user_synopsis"])
        print("\n=======================\n")


if __name__ == "__main__":
    main()
