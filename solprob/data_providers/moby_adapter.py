async def get_token_details(contract: str):
    # TODO replace with Moby endpoints once provided
    return await get_birdeye_or_dexscreener(contract)

async def get_whale_data(contract: str):
    # TODO replace with Moby whale API
    return await simulate_whales(contract)
