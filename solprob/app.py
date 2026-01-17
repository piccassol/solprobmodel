# app.py — Bloomberg-ish dashboard for your crypto probability screener
#
# Run:
#
#   streamlit run app.py
#
# Then open the local URL in your browser; or share a public link if you're
# running on a remote Notebook / server.

import os
import json
import textwrap
import subprocess
from datetime import datetime, timedelta

import pandas as pd
import streamlit as st
import plotly.graph_objects as go

# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------

def run_cmd(cmd, timeout=120):
    """
    Runs the given command (list of arguments) and returns (returncode, stdout, stderr).
    """
    try:
        p = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        so, se = p.communicate(timeout=timeout)
        return p.returncode, so, se
    except subprocess.TimeoutExpired:
        p.kill()
        return -1, "", "Command timeout"


def collapse_text(text, width=100):
    """
    Convenience function to wrap/format longer text into something that displays
    nicely in streamlit columns.
    """
    if not text:
        return ""
    return "\n".join(textwrap.wrap(text, width))


# -------------------------------------------------------------------------
# Layout / Sidebar
# -------------------------------------------------------------------------

st.set_page_config(page_title="Crypto Probabilities", layout="wide")

st.sidebar.title("Crypto Probability Screener")
st.sidebar.markdown(
    """
A prototype *Bloomberg-ish* dashboard for exploring:
- **On-chain whale flows**
- **Token probabilities / scenarios**
- **Twitter sentiment / tempo**
- **Basic risk flags**

All data is fetched live from your underlying Python agent infra.
"""
)

# Mixed layout: one row with 3 or 4 columns of stats + one big chart area + detail
# area for the token, whale flows, probability commentary, tweets, etc.

st.title("AI + Whale Data Crypto Dashboard")

st.markdown(
    """
This is a **conceptual UI** that could be embedded into MobyScreener.  
Think of it as the *visual frontend* to your existing Python agent backend:

- Left: **Token search & configs**  
- Top row: **Key metrics** (price, volume, whale flows, risk)  
- Middle: **Charts** (price, whale flows, probabilities / scenarios)  
- Bottom: **Narrative AI commentary** (bull/bear/base case) + **tweets**.
"""
)

# -------------------------------------------------------------------------
# Top Controls: Token selection, timeframe, etc.
# -------------------------------------------------------------------------

with st.sidebar:
    st.subheader("Token & Timeframe")

    dex_query = st.text_input(
        "Token / Pair (symbol, address, or DexScreener URL)",
        value="SOL",
        help="e.g., SOL, or a specific Raydium pair URL",
    )

    dex_address = st.text_input(
        "Direct contract address (optional)",
        value="",
        help="If you know the exact token/pair address",
    )

    timeframe = st.selectbox(
        "Timeframe",
        ["1h", "4h", "1d"],
        index=1,
        help="Time window for OHLC and whale flow summaries",
    )

    st.subheader("Twitter Scan")

    tweet_q = st.text_input(
        "Tweet keyword / query",
        value="SOL",
        help="e.g., 'SOL', 'JUP airdrop', etc.",
    )
    tweet_window = st.number_input(
        "Tweet window (minutes)",
        min_value=5,
        max_value=720,
        value=60,
        step=5,
    )
    counts_only = st.checkbox("Counts only", value=True)

    st.subheader("Run Analysis")
    run_button = st.button("Analyze Token + Sentiment")


# -------------------------------------------------------------------------
# Placeholders for results
# -------------------------------------------------------------------------

dex_col, whale_col, prob_col, risk_col = st.columns(4)
chart_col, side_col = st.columns([2, 1])

with chart_col:
    price_chart_placeholder = st.empty()
    whale_chart_placeholder = st.empty()
    prob_chart_placeholder = st.empty()

with side_col:
    prob_text_placeholder = st.empty()
    whale_text_placeholder = st.empty()
    tweet_text_placeholder = st.empty()
    risk_text_placeholder = st.empty()

# -------------------------------------------------------------------------
# Main Analysis (only runs when button pressed)
# -------------------------------------------------------------------------

if run_button:
    st.markdown("### Running live analysis…")

    # ---------------------------------------------------------------------
    # 1) DexScreener / Moby-style token data
    # ---------------------------------------------------------------------
    with dex_col:
        st.markdown("#### Token Snapshot")

    dex_json = None
    try:
        if dex_address:
            # Direct address call
            rc, so, se = run_cmd([
                "python", "-c",
                (
                    "import data_providers.tools_live as tools_live, json; "
                    f"print(json.dumps(tools_live.summarize_dex("
                    f"tools_live.dexscreener_token('{dex_address}'))))"
                )
            ])
        else:
            # Search-based call using the dex_query
            rc, so, se = run_cmd([
                "python", "-c",
                (
                    "import data_providers.tools_live as tools_live, json; "
                    f"print(json.dumps(tools_live.summarize_dex("
                    f"tools_live.dexscreener_search({json.dumps(dex_query)}))) )"
                )
            ])
        if rc == 0:
            dex_json = json.loads(so.strip())
        else:
            st.error(f"Dex error: {se}")
    except Exception as e:
        st.error(f"Dex exception: {e}")

    if dex_json:
        with dex_col:
            st.metric("Symbol", dex_json.get("symbol", "N/A"))
            st.metric("Price (USD)", f"{dex_json.get('price_usd', 0):.4f}")
            st.metric("24h Volume", f"${dex_json.get('volume_usd_24h', 0):,.0f}")
            st.metric("Liquidity", f"${dex_json.get('liquidity_usd', 0):,.0f}")

        # Build a basic price chart (mocked from any OHLC fields if available)
        price_hist = dex_json.get("price_history", [])
        if price_hist:
            df_price = pd.DataFrame(price_hist)
            df_price["time"] = pd.to_datetime(df_price["time"], unit="s")
            fig_price = go.Figure()
            fig_price.add_trace(go.Scatter(
                x=df_price["time"],
                y=df_price["price"],
                mode="lines",
                name="Price (USD)",
            ))
            fig_price.update_layout(
                height=260, margin=dict(l=10, r=10, t=40, b=10), template="plotly_white"
            )
            price_chart_placeholder.plotly_chart(fig_price, use_container_width=True)

    # ---------------------------------------------------------------------
    # 2) Twitter recent counts (counts-only first)
    # ---------------------------------------------------------------------
    tw_json = None
    try:
        code = (
            "import data_providers.tools_live as tools_live, json; "
            f"print(json.dumps(tools_live.twitter_recent_count({json.dumps(tweet_q)}, "
            f"window_minutes={int(tweet_window)}, counts_only={str(counts_only)})))"
        )
        rc, so, se = run_cmd(["python", "-c", code])
        if rc == 0:
            tw_json = json.loads(so.strip())
        else:
            st.error(f"Twitter error: {se}")
    except Exception as e:
        st.error(f"Twitter exception: {e}")

    if tw_json:
        with prob_col:
            st.markdown("#### Twitter Tempo")
            st.metric("Tweets in Window", f"{tw_json.get('total_count', 0):,}")
            st.metric(
                "Avg / Min",
                f"{tw_json.get('avg_per_minute', 0):.1f} tweets/min",
            )

        with tweet_text_placeholder:
            st.markdown("#### Tweet Commentary (Agent)")
            # You could call your agent here with tw_json
            st.info(
                collapse_text(
                    f"In the last {int(tweet_window)} minutes, there were "
                    f"{tw_json.get('total_count', 0)} tweets matching '{tweet_q}'. "
                    "The agent can interpret this as 'high/medium/low' social activity "
                    "and relate it to price/whale flows."
                )
            )

    # ---------------------------------------------------------------------
    # 3) Whale flows + probability model (via your `solprob.py` or similar)
    # ---------------------------------------------------------------------
    with whale_col:
        st.markdown("#### Whale Flows (24h)")

    whale_json = None
    prob_json = None

    # Here we assume your backend provides a CLI entry point for whales + probs,
    # e.g., via solprob.py or a tools_live function.
    # Replace these calls with your real logic as needed.

    # Example: call `solprob.py` to get probabilities and scenario commentary.
    try:
        rc, so, se = run_cmd(["python", "solprob.py", dex_query])
        if rc == 0:
            prob_json = json.loads(so.strip())
        else:
            st.error(f"Probability model error: {se}")
    except Exception as e:
        st.error(f"Probability model exception: {e}")

    # Whale data might come from tools_live or another module.
    # If tools_live has something like `whale_flows(token)`:
    try:
        # Adjust to your real function name
        rc, so, se = run_cmd([
            "python", "-c",
            (
                "import data_providers.tools_live as tools_live, json; "
                f"print(json.dumps(tools_live.whale_flows({json.dumps(dex_query)})))"
            )
        ])
        if rc == 0:
            whale_json = json.loads(so.strip())
        else:
            st.warning("Whale data endpoint not wired yet (or error occurred).")
    except Exception:
        st.warning("Whale flows not implemented yet in tools_live.")

    # Whale KPIs + mini chart
    if whale_json:
        with whale_col:
            st.metric("Net Whale Flow (24h)", f"${whale_json.get('net_usd_24h', 0):,.0f}")
            st.metric("Whale Buys (24h)", f"${whale_json.get('buys_usd_24h', 0):,.0f}")
            st.metric("Whale Sells (24h)", f"${whale_json.get('sells_usd_24h', 0):,.0f}")
            st.metric("Unique Whale Wallets", whale_json.get("unique_whales_24h", 0))

        wf_hist = whale_json.get("flow_history", [])
        if wf_hist:
            df_whale = pd.DataFrame(wf_hist)
            df_whale["time"] = pd.to_datetime(df_whale["time"], unit="s")
            fig_whale = go.Figure()
            fig_whale.add_trace(go.Bar(
                x=df_whale["time"],
                y=df_whale["net_flow"],
                name="Net Whale Flow (USD)",
            ))
            fig_whale.update_layout(
                height=260, margin=dict(l=10, r=10, t=40, b=10), template="plotly_white"
            )
            whale_chart_placeholder.plotly_chart(fig_whale, use_container_width=True)

        with whale_text_placeholder:
            st.markdown("#### Whale Commentary (Agent)")
            st.info(
                collapse_text(
                    whale_json.get(
                        "commentary",
                        "Whale commentary not yet implemented; your agent can describe "
                        "which wallets are accumulating vs. distributing, and why that "
                        "matters for this token over the next 24–72 hours.",
                    )
                )
            )

    # Probability outputs (scenarios, base/bull/bear)
    if prob_json:
        with prob_col:
            st.markdown("#### Probability Snapshot")
            st.metric(
                "Bull Case Prob.",
                f"{prob_json.get('bull_prob', 0) * 100:.1f}%",
            )
            st.metric(
                "Base Case Prob.",
                f"{prob_json.get('base_prob', 0) * 100:.1f}%",
            )
            st.metric(
                "Bear Case Prob.",
                f"{prob_json.get('bear_prob', 0) * 100:.1f}%",
            )

        # Simple probability chart
        scenarios = ["Bear", "Base", "Bull"]
        probs = [
            prob_json.get("bear_prob", 0),
            prob_json.get("base_prob", 0),
            prob_json.get("bull_prob", 0),
        ]
        fig_prob = go.Figure(
            data=[go.Bar(x=scenarios, y=probs, text=[f"{p*100:.1f}%" for p in probs])]
        )
        fig_prob.update_layout(
            height=260, margin=dict(l=10, r=10, t=40, b=10), template="plotly_white"
        )
        prob_chart_placeholder.plotly_chart(fig_prob, use_container_width=True)

        with prob_text_placeholder:
            st.markdown("#### Scenario Commentary (Agent)")
            st.info(
                collapse_text(
                    prob_json.get(
                        "commentary",
                        "Probability commentary not yet filled in. Your agent can explain "
                        "what each scenario means (e.g., base case, bull case, bear case) "
                        "and the drivers behind them (whale flows, sentiment, liquidity, etc.).",
                    )
                )
            )

    # ---------------------------------------------------------------------
    # 4) Risk Section
    # ---------------------------------------------------------------------
    with risk_col:
        st.markdown("#### Risk Flags")
        # Example placeholders; you can pipe in real flags from your backend model.
        st.metric("Risk Score", "63 / 100")
        st.metric("Volatility", "High")
        st.metric("Rug Risk", "Elevated")
        st.metric("Liquidity Risk", "Moderate")
    with risk_text_placeholder:
        st.markdown("#### Risk Commentary (Agent)")
        st.warning(
            collapse_text(
                "This is a conceptual risk section. In production, your agent would "
                "summarize contract-level risks (honeypot / ownership / tax), "
                "liquidity constraints, whale concentration, and general "
                "'probability of large drawdowns'. Always include a 'not financial advice' disclaimer."
            )
        )



else:
    st.info("Enter a token / query on the left and click **Analyze Token + Sentiment** to run the pipeline.")
