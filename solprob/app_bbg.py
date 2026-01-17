import datetime as dt
import os
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import streamlit.components.v1 as components
from dotenv import load_dotenv

load_dotenv()

#
# Basic settings
#
st.set_page_config(
    page_title="Moby Agent – Sol/Token Dashboard",
    page_icon="🐳",
    layout="wide",
)

#
# Simple helpers
#


def load_ohlcv(csv_path: str) -> pd.DataFrame:
    if not os.path.exists(csv_path):
        st.warning(f"CSV not found at: {csv_path}")
        return pd.DataFrame()
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        st.error(f"Error reading CSV: {e}")
        return pd.DataFrame()

    # Try to normalize common column names
    cols = {c.lower(): c for c in df.columns}
    for k in ["time", "timestamp", "date"]:
        if k in cols:
            ts_col = cols[k]
            break
    else:
        st.error("Could not find a time/timestamp/date column in CSV.")
        return pd.DataFrame()

    df["ts"] = pd.to_datetime(df[ts_col])
    df = df.sort_values("ts")

    def find(name: str, fallback: Optional[float] = None) -> str:
        for c in df.columns:
            cl = c.lower()
            if cl.startswith(name) or cl == name:
                return c
        if fallback is None:
            raise ValueError(f"Missing required column for {name}")
        return ""

    try:
        o = find("open")
        h = find("high")
        l = find("low")
        c = find("close")
    except ValueError as e:
        st.error(str(e))
        return pd.DataFrame()

    df = df[["ts", o, h, l, c]].rename(
        columns={o: "open", h: "high", l: "low", c: "close"}
    )
    return df


def make_ohlc_chart(df: pd.DataFrame, title: str = "Price") -> go.Figure:
    fig = go.Figure(
        data=[
            go.Candlestick(
                x=df["ts"],
                open=df["open"],
                high=df["high"],
                low=df["low"],
                close=df["close"],
                name="OHLC",
            )
        ]
    )
    fig.update_layout(
        title=title,
        margin=dict(l=10, r=10, t=30, b=10),
        height=420,
        xaxis_title="Time",
        yaxis_title="Price",
    )
    return fig


def embed_or_meta(url: str, height: int = 420):
    """
    Try to embed an URL in an iframe.
    If the site blocks embedding (X-Frame-Options), we fall back to
    a big 'Open in new tab' link and a short note.
    """
    if not url:
        st.info("No URL provided.")
        return

    iframe_html = f"""
    <iframe src="{url}"
            style="width: 100%; height: {height}px; border: none;"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms">
    </iframe>
    """
    try:
        st.components.v1.html(iframe_html, height=height + 10)
    except Exception:
        st.write(f"[Open in a new tab]({url})")
        st.caption("This site may block embedding; opened as a link instead.")


#
# Layout – sidebar controls
#

with st.sidebar:
    st.markdown("### Controls")
    csv_path = st.text_input("OHLCV CSV", value=r".\data\MY_TOKEN.csv")
    token_symbol = st.text_input("Token symbol (for UI labels)", value="MOBY")

    st.markdown("#### Model params")
    horizon_hours = st.number_input("Horizon (hours)", 1, 48, 6)
    up_mult = st.number_input("Upside threshold (×)", 1.0, 5.0, 1.01, step=0.01)
    dn_drop = st.number_input("Downside drop", 0.0, 1.0, 0.05, step=0.01)
    steps = st.number_input("Steps", 1, 10, 3)

    st.markdown("#### X / sentiment")
    tweet_query = st.text_input(
        "X query (not used yet – feed is sample)",
        value="$MOBY lang:en -is:retweet -is:reply -is:quote",
    )

    st.markdown("#### External charts")
    gmgn_social_url = st.text_input(
        "GMGN social / sentiment URL",
        value="https://gmgn.ai/social/single/sol/So11111111111111111111111111111111111111112",
    )

    multichart_urls = st.text_area(
        "Multi-chart URLs (one per line)",
        value=(
            "https://gmgn.ai/defi/pools/sol/So11111111111111111111111111111111111111112\n"
            "https://www.coinglass.com/pro/i/SOL\n"
        ),
    )

    moby_url = st.text_input(
        "$MOBY whale dashboard URL",
        value="https://gmgn.ai/defi/token/sol/Cy1GS2FqefgaMbi45UunrUzin1rfEmTUYnomddzBpump",
    )

    st.markdown("#### Diagnostics")
    st.caption(f"X_BEARER present: {bool(os.getenv('X_BEARER'))}")
    st.caption(f"CSV exists: {os.path.exists(csv_path)}")


#
# Main layout
#

st.markdown(
    """
<style>
.cardgrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}
.panel {
    border-radius: 10px;
    padding: 10px 12px;
    background: #050814;
    border: 1px solid rgba(255,255,255,0.05);
}
.panel2 {
    border-radius: 8px;
    padding: 6px 8px;
    background: #070a18;
    border: 1px solid rgba(255,255,255,0.05);
}
.tape {
    background: linear-gradient(90deg, #0f172a, #020617);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: #e5e7eb;
    border: 1px solid rgba(148,163,184,0.5);
}
.tablabel {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #9ca3af;
}
</style>
""",
    unsafe_allow_html=True,
)

st.title("🐳 Moby Agent – Solana & Token Monitor")

now = dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
st.markdown(
    f'<div class="tape"><b>NOW</b> {now} • Token {token_symbol} • CSV {csv_path}</div>',
    unsafe_allow_html=True,
)

st.write("")

df = load_ohlcv(csv_path)
if df.empty:
    st.stop()

#
# MAIN GRID: 3 columns (L big, C mid, R mid)
#
left, center, right = st.columns([2.2, 1.3, 1.6])

# LEFT: OHLC chart
with left:
    st.markdown('<div class="panel">', unsafe_allow_html=True)
    st.markdown(
        f"<span class='tablabel'>Price Structure</span>",
        unsafe_allow_html=True,
    )
    fig = make_ohlc_chart(df, title=f"{token_symbol} OHLC")
    st.plotly_chart(fig, use_container_width=True)
    st.markdown("</div>", unsafe_allow_html=True)

# CENTER: Social feed (sample $MOBY posts)
with center:
    st.markdown('<div class="panel">', unsafe_allow_html=True)
    st.markdown(
        f"<span class='tablabel'>Social — ${token_symbol}</span>",
        unsafe_allow_html=True,
    )

    sample_posts = [
        {
            "user": "@MobyAgent",
            "ts": "Just now",
            "text": f"Whales quietly stacking ${token_symbol} again. On-chain flow flipping net positive and liquidity getting thicker on SOL pools. Moby Agent is watching 👀",
            "likes": 128,
            "rts": 42,
        },
        {
            "user": "@onchainwhale",
            "ts": "3 min ago",
            "text": f"3 wallets just added >$250k of ${token_symbol} in the last hour. No Telegram hype, just silent accumulation. I’ll let Moby do the talking.",
            "likes": 212,
            "rts": 63,
        },
        {
            "user": "@flowalerts",
            "ts": "9 min ago",
            "text": f"${token_symbol} funding looks clean, perp skew flat, but on-chain spot flow is one-sided. If this keeps up, the next leg could get violent.",
            "likes": 187,
            "rts": 51,
        },
        {
            "user": "@MobyLabs",
            "ts": "16 min ago",
            "text": f"Rolled out a new whale-flow score for ${token_symbol}. It blends DEX prints, wallet clustering and time-of-day patterns into a single 0-100 signal.",
            "likes": 304,
            "rts": 97,
        },
    ]

    st.caption(
        "Sample live-style feed for the Moby Agent dashboard. In production this panel can stream real X posts for your query."
    )
    for p in sample_posts:
        st.markdown(f"**{p['user']}** · {p['ts']}")
        st.write(p["text"])
        st.caption(f"❤ {p['likes']}   🔁 {p['rts']}")
        st.markdown("---")

    st.markdown("</div>", unsafe_allow_html=True)

# RIGHT: Markets (TradingView + CoinMarketCap) + extra charts + Moby whale tracker
with right:
    st.markdown('<div class="panel">', unsafe_allow_html=True)
    st.markdown("<span class='tablabel'>Markets</span>", unsafe_allow_html=True)

    # TradingView chart (Solana by default)
    tv_symbol = "BINANCE:SOLUSDT"
    tv_html = f"""
    <!-- TradingView Widget BEGIN -->
    <div class="tradingview-widget-container">
      <div id="tradingview_sol"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
      <script type="text/javascript">
      new TradingView.widget({{
          "width": "100%",
          "height": 400,
          "symbol": "{tv_symbol}",
          "interval": "60",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#131722",
          "enable_publishing": false,
          "hide_legend": false,
          "container_id": "tradingview_sol"
      }});
      </script>
    </div>
    <!-- TradingView Widget END -->
    """
    components.html(tv_html, height=420)

    # CoinMarketCap widget for Solana (ID 5426)
    cmc_html = """
    <script type="text/javascript" src="https://files.coinmarketcap.com/static/widget/currency.js"></script>
    <div class="coinmarketcap-currency-widget"
         data-currencyid="5426"
         data-base="USD"
         data-secondary=""
         data-ticker="true"
         data-rank="true"
         data-marketcap="true"
         data-volume="true"
         data-statsticker="true"
         data-stats="USD"></div>
    """
    components.html(cmc_html, height=260, scrolling=False)

    st.markdown("<hr style='margin: 12px 0'>", unsafe_allow_html=True)
    st.markdown("##### Extra DEX / analytics charts", unsafe_allow_html=True)

    urls = [u.strip() for u in multichart_urls.splitlines() if u.strip()]
    if not urls:
        st.info("Add chart URLs in the sidebar (one per line).")
    else:
        st.markdown('<div class="cardgrid">', unsafe_allow_html=True)
        for u in urls[:6]:
            st.markdown('<div class="panel2">', unsafe_allow_html=True)
            st.markdown(f"[Open]({u})")
            embed_or_meta(u, height=360)
            st.markdown("</div>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<br><span class='tablabel'>Moby Whale Tracker</span>", unsafe_allow_html=True)
    st.markdown(f"[Open in new tab]({moby_url})")
    embed_or_meta(moby_url, height=420)
    st.markdown("</div>", unsafe_allow_html=True)
