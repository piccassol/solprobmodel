# Privacy Oracle Agent

An AI-powered agent for creating privacy-themed prediction markets on Solana using the PNP Exchange protocol and Helius infrastructure.

Built for the **Solana Privacy Hackathon 2026**.

## Bounties Targeted

- **Helius ($5,000)** - Best privacy project leveraging Helius RPCs and developer tooling
- **PNP Exchange ($2,500)** - AI agents creating prediction markets with privacy-focused tokens

## Features

- AI-generated privacy-themed prediction market questions
- Multiple market categories: regulation, technology, adoption, events
- Supports both AMM and P2P market creation
- **Autonomous daemon mode** with configurable schedules (cron or interval)
- **News monitoring** via RSS feeds for timely market generation
- **Webhook server** for Helius transaction events
- Market analytics and statistics tracking
- Privacy token collateral support (Token-2022 confidential transfers)
- Interactive CLI wizard for guided market creation
- Full Helius RPC integration for reliable Solana access

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file:

```bash
# Required for market creation
WALLET_PRIVATE_KEY=your_base58_private_key_or_array

# Helius API key (recommended)
HELIUS_API_KEY=your_helius_api_key

# Network (devnet or mainnet)
NETWORK=devnet

# Optional defaults
DEFAULT_LIQUIDITY=1000000
DEFAULT_DURATION_DAYS=30

# Daemon settings
DAEMON_SCHEDULE=1h
DAEMON_MARKETS_PER_ROUND=1
DAEMON_STORAGE_PATH=./data/markets.db

# News monitoring
NEWS_ENABLED=false

# Webhook server
WEBHOOK_ENABLED=false
WEBHOOK_PORT=3000
WEBHOOK_AUTH_TOKEN=

# Privacy collateral
COLLATERAL_TOKEN=USDC
```

Get a free Helius API key at [helius.dev](https://helius.dev)

## Usage

### CLI Commands

```bash
# Generate market ideas (no wallet needed)
npm run agent generate -c 5

# Generate from specific category
npm run agent generate -k technology -c 3

# Show market categories
npm run agent categories

# Create a single privacy-themed market
npm run agent create

# Create with custom question
npm run agent create -q "Will GDPR fines exceed $5B in 2026?"

# Create multiple markets
npm run agent batch -c 3

# List existing markets
npm run agent list

# Get market info
npm run agent info <market_address>

# Show config
npm run agent config

# Interactive mode (guided wizard)
npm run agent interactive

# View market statistics
npm run agent stats --period 7d

# List supported collateral tokens
npm run agent tokens

# Check if a mint supports confidential transfers
npm run agent tokens --check <mint_address>
```

### Daemon Mode

Run as an autonomous daemon that creates markets on a schedule:

```bash
# Basic daemon (1 market per hour)
npm run daemon

# Custom schedule with news monitoring
npm run agent daemon -s 30m -c 2 --news

# With webhook server for Helius events
npm run agent daemon -s 1h --webhooks --webhook-port 3000

# Dry run (generate without creating on-chain)
npm run agent daemon --dry-run

# Limited iterations
npm run agent daemon -n 10 -s 5m
```

Daemon options:
- `-s, --schedule <schedule>` - Cron expression or interval (30m, 1h, 24h)
- `-n, --iterations <count>` - Max iterations (infinite if omitted)
- `-c, --count <count>` - Markets per cycle (default: 1)
- `--dry-run` - Generate without creating on-chain
- `--news` - Enable news monitoring for timely markets
- `--webhooks` - Enable webhook server
- `--webhook-port <port>` - Webhook port (default: 3000)

### Programmatic Usage

```javascript
import { createAgent, generatePrivacyMarket } from 'privacy-oracle-agent';

// Create an agent
const agent = await createAgent({ verbose: true });

// Generate and create a privacy market
const result = await agent.createPrivacyMarket();
console.log('Created market:', result.market);

// Or create with custom question
const custom = await agent.createMarket({
    question: 'Will Tornado Cash sanctions be lifted by 2027?',
    durationDays: 365,
    liquidity: 5000000n
});

// Batch create markets
const batch = await agent.createBatchMarkets(5);
```

### Quick Create

```javascript
import { quickCreate } from 'privacy-oracle-agent';

// Auto-generate a privacy market
const market = await quickCreate();

// Or with custom question
const custom = await quickCreate('Will the US pass federal privacy law by 2027?', {
    durationDays: 365
});
```

### Daemon API

```javascript
import { startDaemon } from 'privacy-oracle-agent';

// Start daemon programmatically
const daemon = await startDaemon({
    daemon: {
        schedule: '1h',
        marketsPerRound: 2
    },
    news: { enabled: true }
});

// Stop daemon
await daemon.stop();
```

## Market Categories

| Category | Weight | Urgency | Examples |
|----------|--------|---------|----------|
| Privacy Regulation | 25% | Timely | GDPR fines, federal privacy laws, encryption bans |
| Privacy Technology | 30% | Evergreen | ZK adoption, Tornado Cash, confidential transactions |
| Privacy Adoption | 25% | Timely | Signal users, privacy coin delistings, enterprise ZK |
| Privacy Events | 20% | Breaking | Data breaches, surveillance scandals, hackathon wins |

## Architecture

```
privacy-oracle-agent/
  src/
    agent.js              # Core agent class with PNP SDK integration
    cli.js                # Command line interface
    config.js             # Environment and configuration handling
    privacy-markets.js    # Market templates and AI generation
    index.js              # Public API exports
    helius/
      client.js           # Helius API wrapper (DAS, webhooks, etc.)
      transaction-tracker.js  # Transaction confirmation tracking
      webhooks.js         # Express server for Helius webhooks
    daemon/
      index.js            # Main daemon orchestrator
      scheduler.js        # Cron-style scheduling
      lifecycle.js        # Graceful shutdown handling
    storage/
      market-store.js     # SQLite persistence layer
    monitoring/
      news-monitor.js     # RSS feed monitoring
      news-scorer.js      # Relevance scoring algorithm
    analytics/
      aggregator.js       # Dashboard data aggregation
    collateral/
      privacy-tokens.js   # Privacy token support
    events/
      emitter.js          # Central event bus
    utils/
      spinner.js          # CLI spinners and progress
  test/
    *.test.js             # Test suites
```

## How It Works

1. **Market Generation**: The agent uses weighted random selection across privacy-themed categories to generate relevant prediction market questions.

2. **Template System**: Each category contains templates with placeholders filled dynamically with current dates, companies, and amounts.

3. **Helius Integration**: All Solana RPC calls go through Helius for reliability, speed, and better transaction landing rates.

4. **PNP SDK**: Markets are created on the PNP Exchange protocol, supporting both AMM pools and P2P betting.

5. **Daemon Mode**: Autonomous operation with configurable schedules, news monitoring, and webhook integration.

6. **Privacy Tokens**: Support for Token-2022 confidential transfers as collateral.

## Privacy Focus

All generated markets focus on privacy-related topics:

- Regulatory developments around data protection
- Zero-knowledge technology adoption
- Privacy tool usage metrics
- Significant privacy events and breaches

This creates a focused prediction market ecosystem around privacy topics, helping gauge community sentiment on important privacy developments.

## Testing

```bash
npm test
```

## Contributing

Contributions welcome! Areas of interest:

- Additional market categories and templates
- Integration with more privacy protocols
- Enhanced AI market generation
- Market monitoring and analytics

## License

MIT

## Links

- [PNP Exchange](https://pnp.exchange)
- [Helius](https://helius.dev)
- [Solana Privacy Hackathon](https://solana.com/privacyhack)
