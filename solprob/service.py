# service.py — HTTP wrapper around agent.run_agent using FastAPI
from typing import Optional, Dict, Any

import argparse
from fastapi import FastAPI, Query
from pydantic import BaseModel

from agent import run_agent


class TokenResponse(BaseModel):
    facts: Dict[str, Any]
    edge_prelim: str
    trade_brief: str
    user_synopsis: str
    raw: Dict[str, Any]


app = FastAPI(title="SolProb Token Analyst", version="0.1.0")


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/token-analysis", response_model=TokenResponse)
def token_analysis(
    csv: str = Query(..., description="Backend path or identifier for the OHLCV CSV for this token."),
    dex_address: Optional[str] = Query(
        None,
        description="Dexscreener token address (preferred if you already know it).",
    ),
    dex_query: Optional[str] = Query(
        None,
        description="Dexscreener search query if you do not have an exact address.",
    ),
    moby_url: Optional[str] = Query(
        None,
        description="URL of the token page on mobyscreener.com (for scraping Moby stats).",
    ),
    tweet_query: Optional[str] = Query(
        None,
        description="Twitter/X search query for sentiment counts.",
    ),
    # Model configuration
    horizon_hours: float = Query(24.0),
    up_mult: float = Query(1.2),
    dn_drop: float = Query(0.10),
    steps: int = Query(4),
    calibration: str = Query("isotonic", regex="^(sigmoid|isotonic)$"),
    # Dex filters
    min_liquidity_usd: Optional[float] = Query(100000.0),
    min_vol24h_usd: Optional[float] = Query(None),
    prefer_chain: Optional[str] = Query("solana"),
    require_quote: Optional[str] = Query("SOL"),
    # LLM + tweets
    model_tag: str = Query("llama3.2:3b"),
    tweet_max_results: int = Query(50),
    tweet_pages: int = Query(1),
    tweet_window_minutes: int = Query(60),
    tweet_counts_only: bool = Query(True),
):
    """Run the full pipeline for a token and return the analysis JSON.

    Frontend contract:
      - use `facts.model.probability` for the gauge
      - use `edge_prelim` for the state label
      - display `user_synopsis` in the main UI
      - optionally surface `trade_brief` for advanced users
    """
    # Build an argparse.Namespace compatible with agent.run_agent
    args = argparse.Namespace(
        pyfile="solprob.py",
        csv=csv,
        # Dex
        dex_query=dex_query,
        dex_address=dex_address,
        min_liquidity_usd=min_liquidity_usd,
        min_vol24h_usd=min_vol24h_usd,
        prefer_chain=prefer_chain,
        require_quote=require_quote,
        # Moby
        moby_url=moby_url,
        # Tweets
        tweet_query=tweet_query,
        tweet_max_results=tweet_max_results,
        tweet_pages=tweet_pages,
        tweet_window_minutes=tweet_window_minutes,
        tweet_counts_only=tweet_counts_only,
        # Prob model
        horizon_hours=horizon_hours,
        up_mult=up_mult,
        dn_drop=dn_drop,
        steps=steps,
        calibration=calibration,
        # LLM
        model_tag=model_tag,
    )
    result = run_agent(args)
    return result
