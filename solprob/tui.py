import argparse
import requests
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

API_BASE = "http://localhost:8000"
console = Console()


def call_token_analysis(csv, dex_address, moby_url="", tweet_query=""):
    params = {
        "csv": csv,
        "dex_address": dex_address,
    }
    if moby_url:
        params["moby_url"] = moby_url
    if tweet_query:
        params["tweet_query"] = tweet_query
    resp = requests.get(f"{API_BASE}/token-analysis", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--dex_address", required=True)
    ap.add_argument("--moby_url", default="")
    ap.add_argument("--tweet_query", default="")
    args = ap.parse_args()

    data = call_token_analysis(args.csv, args.dex_address, args.moby_url, args.tweet_query)

    facts = data.get("facts", {})
    model = facts.get("model", {})
    top_pair = facts.get("dexscreener_top_pair")
    whale = facts.get("moby_whale_sentiment")
    edge = data.get("edge_prelim")
    synopsis = data.get("user_synopsis")
    brief = data.get("trade_brief")

    prob = (model.get("probability") or 0.0) * 100.0

    console.rule("[bold cyan]MobyAI Token Engine[/bold cyan]")

    # Header
    hdr = Table(show_header=False, show_edge=False, pad_edge=False)
    hdr.add_row("Target", facts.get("target", "N/A"))
    hdr.add_row("Edge", str(edge))
    hdr.add_row("P(+up before -down)", f"{prob:.2f} %")
    console.print(hdr)

    console.rule("[bold green]Whale Sentiment[/bold green]")
    if whale:
        ws = Table(show_header=False)
        ws.add_row("Label", str(whale.get("label") or "N/A"))
        ws.add_row("Score", str(whale.get("score")))
        ws.add_row("Buys 24h", str(whale.get("whale_buys_24h")))
        ws.add_row("Sells 24h", str(whale.get("whale_sells_24h")))
        ws.add_row("Net 24h", str(whale.get("net_whales_24h")))
        console.print(ws)
    else:
        console.print("No whale sentiment available.")

    console.rule("[bold yellow]Market Snapshot[/bold yellow]")
    if top_pair:
        mp = Table(show_header=False)
        mp.add_row("Chain", str(top_pair.get("chain")))
        mp.add_row("DEX", str(top_pair.get("dex")))
        mp.add_row("Price USD", str(top_pair.get("priceUsd")))
        mp.add_row("Liquidity USD", str(top_pair.get("liquidityUsd")))
        mp.add_row("Vol 24h USD", str(top_pair.get("vol24h")))
        console.print(mp)
    else:
        console.print("No qualifying Dexscreener pair (check filters).")

    console.rule("[bold magenta]AI Synopsis[/bold magenta]")
    console.print(Panel.fit(Text(synopsis or "No synopsis.", justify="left")))

    console.rule("[bold blue]Trade Brief[/bold blue]")
    console.print(brief or "No brief.")


if __name__ == "__main__":
    main()
