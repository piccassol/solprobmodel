# context_builder.py
from typing import Dict, Any

from moby_api import get_token_details, get_ohlcv, get_whale_data
from token_context import (
    TokenContext,
    MetaSection,
    MarketSection,
    WhaleSection,
    WhaleTxSample,
    TechnicalSection,
    RiskSection,
    RiskFlags,
    CommentarySection,
    now_iso,
)


async def build_token_context(token_id: str) -> TokenContext:
    details, ohlcv, whale = await _fetch_raw(token_id)
    market = _compute_market(ohlcv)
    technicals = _compute_technicals(ohlcv)
    whale_section = _build_whale_section(whale)
    risk = _compute_risk(market, whale_section)
    commentary = CommentarySection(
        short_summary="",  # will be filled by LLM or heuristics
        bull_case=None,
        bear_case=None,
        neutral_notes=None,
        last_updated=now_iso(),
    )

    meta = MetaSection(
        id=details.id,
        symbol=details.symbol,
        name=details.name,
        chain=details.chain,
        address=details.address,
        decimals=details.decimals,
        launch_date=details.launch_date,
        tags=details.tags,
    )

    return TokenContext(
        meta=meta,
        market=market,
        whale=whale_section,
        technicals=technicals,
        risk=risk,
        commentary=commentary,
    )


async def _fetch_raw(token_id: str):
    details = await get_token_details(token_id)
    ohlcv = await get_ohlcv(token_id, timeframe="1h", limit=200)
    whale = await get_whale_data(token_id, window_hours=24)
    return details, ohlcv, whale


def _compute_market(ohlcv_points) -> MarketSection:
    if not ohlcv_points:
        return MarketSection(price_usd=0.0)

    latest = ohlcv_points[0]
    price = latest.close

    # naive change calculations for placeholder
    def pct_change(from_price: float, to_price: float) -> float:
        if from_price == 0:
            return 0.0
        return (to_price - from_price) / from_price * 100

    price_1h_ago = ohlcv_points[1].close if len(ohlcv_points) > 1 else price
    price_24h_ago = ohlcv_points[min(24, len(ohlcv_points) - 1)].close
    price_7d_ago = ohlcv_points[-1].close

    return MarketSection(
        price_usd=price,
        price_change_1h_pct=pct_change(price_1h_ago, price),
        price_change_24h_pct=pct_change(price_24h_ago, price),
        price_change_7d_pct=pct_change(price_7d_ago, price),
        # You can fill MCAP, FDV, liquidity when your sources provide them
    )


def _compute_technicals(ohlcv_points) -> TechnicalSection:
    # Very naive placeholder logic
    if len(ohlcv_points) < 2:
        return TechnicalSection(timeframe="1h", trend="sideways")

    first = ohlcv_points[-1].close
    last = ohlcv_points[0].close
    change_pct = (last - first) / first * 100 if first else 0

    if change_pct > 5:
        trend = "uptrend"
    elif change_pct < -5:
        trend = "downtrend"
    else:
        trend = "sideways"

    volatility_label = "medium"
    # TODO: compute based on standard deviation of returns

    return TechnicalSection(
        timeframe="1h",
        trend=trend,
        volatility_label=volatility_label,
        support_levels=[],
        resistance_levels=[],
        notes=[],
    )


def _build_whale_section(whale) -> WhaleSection:
    top_buyer = None
    if whale.top_buyer:
        top_buyer = WhaleTxSample(
            direction=whale.top_buyer.direction,
            size_usd=whale.top_buyer.size_usd,
            wallet_label=whale.top_buyer.wallet_label,
            timestamp=whale.top_buyer.timestamp,
        )

    recent_sample = [
        WhaleTxSample(
            direction=tx.direction,
            size_usd=tx.size_usd,
            wallet_label=tx.wallet_label,
            timestamp=tx.timestamp,
        )
        for tx in whale.recent_transactions[:10]
    ]

    return WhaleSection(
        total_whale_buys_24h_usd=whale.total_whale_buys_usd,
        total_whale_sells_24h_usd=whale.total_whale_sells_usd,
        net_whale_flow_24h_usd=whale.net_whale_flow_usd,
        unique_whales_24h=whale.unique_whale_wallets,
        top_buyer=top_buyer,
        top_seller=None,  # fill when you track it
        recent_transactions_sample=recent_sample,
        smart_money_signals=[],
    )


def _compute_risk(market: MarketSection, whale_section: WhaleSection) -> RiskSection:
    score = 60  # TODO: real heuristics
    label = "medium"

    reasons = ["Placeholder risk model – tuning required."]

    flags = RiskFlags(
        honeypot=None,
        extremely_low_liquidity=None,
        deployer_holds_majority=None,
        recent_rug_reports=None,
        suspicious_tax=None,
        contract_not_verified=None,
        other_notes=[],
    )

    return RiskSection(
        score_0_to_100=score,
        label=label,
        reasons=reasons,
        flags=flags,
    )
