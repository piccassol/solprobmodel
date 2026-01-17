# backend.py
from data_providers.tools_live import (
    dexscreener_search,
    dexscreener_token,
    summarize_dex,
    twitter_recent_count,
    moby_overview,
    whale_flows,   # only if you have it
)

async def get_token_data(query_or_contract):
    # Does the logic your app.py currently does
    try:
        if query_or_contract.startswith("http"):
            data = summarize_dex(dexscreener_search(query_or_contract))
        else:
            data = summarize_dex(dexscreener_search(query_or_contract))
        return data
    except:
        return None

async def get_whales(query_or_contract):
    try:
        return whale_flows(query_or_contract)
    except:
        return None

async def get_twitter(keyword, window=60, counts_only=True):
    return twitter_recent_count(keyword, window_minutes=window, counts_only=counts_only)

async def get_moby_data(query_or_contract):
    return moby_overview(query_or_contract)
