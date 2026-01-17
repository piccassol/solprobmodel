import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

#
# FastAPI app + basic CORS
#
app = FastAPI(
    title="Moby Agent API",
    version="0.1.0",
    description=(
        "Simple agent-style API that fetches token, whale flow and social data, "
        "then returns a structured payload plus a human summary."
    ),
    openapi_version="3.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#
# Models
#


class AgentRequest(BaseModel):
    token: str
    question: str


class DexPair(BaseModel):
    chain: str
    dex: str
    pair: str
    priceUsd: float
    liquidityUsd: float
    vol24h: float
    fdv: Optional[float] = None
    mcap: Optional[float] = None
    raw: Dict[str, Any]


class TokenData(BaseModel):
    pairs: List[DexPair]


class WhaleFlowPoint(BaseModel):
    time: int
    net_flow: float


class WhaleData(BaseModel):
    token: str
    net_usd_24h: float
    buys_usd_24h: float
    sells_usd_24h: float
    unique_whales_24h: int
    flow_history: List[WhaleFlowPoint]
    commentary: str


class TwitterData(BaseModel):
    query: str
    total_count: int
    avg_per_minute: float
    window_minutes: int
    stub: bool = True


class AgentRaw(BaseModel):
    token_data: TokenData
    whale_data: WhaleData
    twitter_data: TwitterData


class AgentResponse(BaseModel):
    token: str
    question: str
    summary: str
    raw: AgentRaw


#
# External sources — DexScreener + Twitter (stub)
#


DEXSCREENER_BASE = "https://api.dexscreener.com/latest/dex"


async def fetch_token_data(token_symbol: str) -> TokenData:
    """
    Very simple DexScreener lookup by token symbol.
    In production you will likely want to hit chain-specific endpoints
    or use the contract mint instead of just the symbol.
    """
    url = f"{DEXSCREENER_BASE}/search?q={token_symbol}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url)
        if r.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"DexScreener error: {r.status_code} {r.text[:200]}",
            )
        data = r.json()

    pairs_raw = data.get("pairs") or []
    pairs: List[DexPair] = []
    for p in pairs_raw:
        try:
            pairs.append(
                DexPair(
                    chain=p.get("chainId", ""),
                    dex=p.get("dexId", ""),
                    pair=f"{p['baseToken']['symbol']} / {p['quoteToken']['symbol']}",
                    priceUsd=float(p.get("priceUsd") or 0.0),
                    liquidityUsd=float(p.get("liquidity", {}).get("usd") or 0.0),
                    vol24h=float(p.get("volume", {}).get("h24") or 0.0),
                    fdv=float(p.get("fdv") or 0.0) if p.get("fdv") else None,
                    mcap=float(p.get("marketCap") or 0.0)
                    if p.get("marketCap")
                    else None,
                    raw=p,
                )
            )
        except Exception:
            # Best effort: skip malformed pairs
            continue

    return TokenData(pairs=pairs)


async def fetch_whale_data(token_symbol: str) -> WhaleData:
    """
    Placeholder whale-flow endpoint.
    Swap this to your real whale analytics service when ready.
    """
    # For now we just return flat zeros but a real structure.
    return WhaleData(
        token=token_symbol.upper(),
        net_usd_24h=0.0,
        buys_usd_24h=0.0,
        sells_usd_24h=0.0,
        unique_whales_24h=0,
        flow_history=[WhaleFlowPoint(time=0, net_flow=0.0)],
        commentary="Whale flows not yet connected to a live data source in this environment.",
    )


async def fetch_twitter_data(query: str, window_minutes: int = 60) -> TwitterData:
    """
    Stub for Twitter/X data. Replace with your real client.
    Right now it just echoes the query back with counts=0 so the front-end
    can still render.
    """
    return TwitterData(
        query=query,
        total_count=0,
        avg_per_minute=0.0,
        window_minutes=window_minutes,
        stub=True,
    )


#
# Helper: summarise the combined data
#


def build_summary(
    token: str, question: str, token_data: TokenData, whale_data: WhaleData, twitter: TwitterData
) -> str:
    # Best-liquidity pair as a quick representative
    rep_pair: Optional[DexPair] = None
    if token_data.pairs:
        rep_pair = max(token_data.pairs, key=lambda p: p.liquidityUsd)

    # Token metrics
    if rep_pair:
        line_token = (
            f"Token: {rep_pair.pair}\n"
            f"Approx. price (USD): {rep_pair.priceUsd:,.4f}\n"
            f"24h volume (USD): {rep_pair.vol24h:,.0f}\n"
            f"Reported liquidity (USD): {rep_pair.liquidityUsd:,.0f}"
        )
    else:
        line_token = "No liquid pairs found on DexScreener for this symbol."

    # Whale flows
    whale_net = whale_data.net_usd_24h
    if whale_net is not None:
        if whale_net > 0:
            whale_line = f"Whale flows (24h): net **inflow** of about ${whale_net:,.0f}."
        elif whale_net < 0:
            whale_line = f"Whale flows (24h): net **outflow** of about ${abs(whale_net):,.0f}."
        else:
            whale_line = "Whale flows (24h): roughly flat so far."
    else:
        whale_line = "Whale flows (24h): not available."

    whales_line2 = f"Unique whale wallets (24h): {whale_data.unique_whales_24h}"

    # Twitter / sentiment
    tw_line = (
        f"Twitter activity (last {twitter.window_minutes} min): "
        f"{twitter.total_count} tweets (~{twitter.avg_per_minute:.1f} per minute)."
    )

    commentary = (
        "Commentary:\n"
        "• Prototype summary from Moby Agent using on-chain, whale, and social data. "
        "In production we can plug in your preferred LLM stack for a richer explanation.\n"
        "• Not financial advice. Always do your own research."
    )

    full = "\n\n".join(
        [
            line_token,
            "",
            whale_line,
            whales_line2,
            tw_line,
            "",
            commentary,
        ]
    )
    return full


#
# Routes
#


@app.get("/token", response_model=TokenData)
async def token_route(symbol: str = Query(..., description="Token symbol, eg SOL or MOBY")):
    """
    Raw token/pair data from DexScreener.
    """
    return await fetch_token_data(symbol)


@app.get("/whales", response_model=WhaleData)
async def whales_route(symbol: str = Query(..., description="Token symbol, eg SOL or MOBY")):
    """
    Whale-flow stub (replace with real analytics service).
    """
    return await fetch_whale_data(symbol)


@app.get("/twitter", response_model=TwitterData)
async def twitter_route(
    q: str = Query(..., description="Twitter/X query string"),
    window: int = Query(60, description="Lookback window in minutes"),
):
    """
    Stubbed twitter/X endpoint.
    """
    return await fetch_twitter_data(q, window_minutes=window)


@app.post("/agent", response_model=AgentResponse)
async def agent_route(body: AgentRequest):
    """
    High-level agent endpoint:
    - pulls token data from DexScreener,
    - pulls whale-flow data from your future whale service,
    - pulls (stubbed) Twitter metrics,
    - returns all raw data plus a human-readable summary.
    """
    token = body.token.strip().upper() or "UNKNOWN"
    question = body.question.strip() or f"What is happening with {token} right now?"

    token_data = await fetch_token_data(token)
    whale_data = await fetch_whale_data(token)
    twitter_data = await fetch_twitter_data(token)

    summary = build_summary(token, question, token_data, whale_data, twitter_data)

    raw = AgentRaw(
        token_data=token_data,
        whale_data=whale_data,
        twitter_data=twitter_data,
    )

    return AgentResponse(
        token=token,
        question=question,
        summary=summary,
        raw=raw,
    )
