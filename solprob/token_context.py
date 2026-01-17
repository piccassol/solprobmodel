# token_context.py
from typing import List, Literal, Optional
from pydantic import BaseModel
from datetime import datetime


class RiskFlags(BaseModel):
    honeypot: Optional[bool] = None
    extremely_low_liquidity: Optional[bool] = None
    deployer_holds_majority: Optional[bool] = None
    recent_rug_reports: Optional[bool] = None
    suspicious_tax: Optional[bool] = None
    contract_not_verified: Optional[bool] = None
    other_notes: Optional[List[str]] = None


class SmartMoneySignal(BaseModel):
    label: str  # e.g. “Smart money accumulating”
    severity: Literal["low", "medium", "high"]
    explanation: str


class MetaSection(BaseModel):
    id: str
    symbol: str
    name: str
    chain: str
    address: str
    decimals: int
    launch_date: Optional[str] = None
    tags: Optional[List[str]] = None


class MarketSection(BaseModel):
    price_usd: float
    price_change_1h_pct: Optional[float] = None
    price_change_24h_pct: Optional[float] = None
    price_change_7d_pct: Optional[float] = None
    market_cap_usd: Optional[float] = None
    fdv_usd: Optional[float] = None
    liquidity_usd: Optional[float] = None
    volume_1h_usd: Optional[float] = None
    volume_24h_usd: Optional[float] = None


class WhaleTxSample(BaseModel):
    direction: Literal["buy", "sell"]
    size_usd: float
    wallet_label: Optional[str] = None
    timestamp: int


class WhaleSection(BaseModel):
    total_whale_buys_24h_usd: Optional[float] = None
    total_whale_sells_24h_usd: Optional[float] = None
    net_whale_flow_24h_usd: Optional[float] = None
    unique_whales_24h: Optional[int] = None
    top_buyer: Optional[WhaleTxSample] = None
    top_seller: Optional[WhaleTxSample] = None
    recent_transactions_sample: Optional[List[WhaleTxSample]] = None
    smart_money_signals: Optional[List[SmartMoneySignal]] = None


class TechnicalSection(BaseModel):
    timeframe: Literal["1h", "4h", "1d"]
    trend: Optional[Literal["uptrend", "downtrend", "sideways"]] = None
    volatility_label: Optional[Literal["low", "medium", "high"]] = None
    support_levels: Optional[List[float]] = None
    resistance_levels: Optional[List[float]] = None
    notes: Optional[List[str]] = None


class RiskSection(BaseModel):
    score_0_to_100: int
    label: Literal["very_low", "low", "medium", "high", "extreme"]
    reasons: List[str]
    flags: RiskFlags


class CommentarySection(BaseModel):
    short_summary: str
    bull_case: Optional[str] = None
    bear_case: Optional[str] = None
    neutral_notes: Optional[str] = None
    last_updated: str


class TokenContext(BaseModel):
    meta: MetaSection
    market: MarketSection
    whale: WhaleSection
    technicals: TechnicalSection
    risk: RiskSection
    commentary: CommentarySection


def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"
