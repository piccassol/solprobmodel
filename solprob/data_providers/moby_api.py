# moby_api.py
from typing import List, Literal, Optional
from pydantic import BaseModel
import time

Timeframe = Literal["1m", "5m", "15m", "1h", "4h", "1d"]


class TokenDetails(BaseModel):
    id: str
    symbol: str
    name: str
    chain: str
    address: str
    decimals: int
    logo_url: Optional[str] = None
    website: Optional[str] = None
    twitter: Optional[str] = None
    telegram: Optional[str] = None
    description: Optional[str] = None
    launch_date: Optional[str] = None  # ISO
    tags: Optional[list[str]] = None


class OHLCVPoint(BaseModel):
    timestamp: int  # ms
    open: float
    high: float
    low: float
    close: float
    volume_base: float
    volume_quote: float


class WhaleTransaction(BaseModel):
    tx_hash: str
    timestamp: int
    from_address: str
    to_address: str
    wallet_label: Optional[str] = None
    size_usd: float
    size_token: float
    direction: Literal["buy", "sell"]
    dex: Optional[str] = None


class WhaleSummary(BaseModel):
    token_id: str
    window_hours: int
    total_whale_buys_usd: float
    total_whale_sells_usd: float
    net_whale_flow_usd: float
    unique_whale_wallets: int
    top_buyer: Optional[WhaleTransaction] = None
    top_seller: Optional[WhaleTransaction] = None
    recent_transactions: List[WhaleTransaction] = []


# For now, these are mock implementations using your current data sources.
# Later, you will replace the internals with Moby’s APIs while keeping the function signatures.


async def get_token_details(token_id: str) -> TokenDetails:
    # TODO: replace with dexscreener / birdeye / Moby API
    return TokenDetails(
        id=token_id,
        symbol="SOL",
        name="Solana",
        chain="solana",
        address="So11111111111111111111111111111111111111112",
        decimals=9,
        tags=["layer1", "smart-contract"],
    )


async def get_ohlcv(
    token_id: str, timeframe: Timeframe = "1h", limit: int = 200
) -> list[OHLCVPoint]:
    # TODO: fetch from your existing market data sources
    now = int(time.time() * 1000)
    return [
        OHLCVPoint(
            timestamp=now - i * 3600_000,
            open=100.0,
            high=110.0,
            low=95.0,
            close=105.0,
            volume_base=1_000_000,
            volume_quote=105_000_000,
        )
        for i in range(limit)
    ]


async def get_whale_data(token_id: str, window_hours: int = 24) -> WhaleSummary:
    # TODO: plug in your current whale logic; later, call Moby’s whale endpoint
    now = int(time.time() * 1000)
    tx = WhaleTransaction(
        tx_hash="0x123",
        timestamp=now - 3_600_000,
        from_address="whale_1",
        to_address="dex_pool",
        wallet_label="Smart Money",
        size_usd=500_000,
        size_token=4_000,
        direction="buy",
        dex="jupiter",
    )

    return WhaleSummary(
        token_id=token_id,
        window_hours=window_hours,
        total_whale_buys_usd=750_000,
        total_whale_sells_usd=250_000,
        net_whale_flow_usd=500_000,
        unique_whale_wallets=3,
        top_buyer=tx,
        recent_transactions=[tx],
    )
