// Privacy Oracle Agent
// AI-powered prediction market creator for privacy-themed markets on Solana
// Uses Helius RPC + PNP SDK

// Core agent
export { PrivacyOracleAgent, createAgent } from './agent.js';
export { getConfig, validateConfig, getHeliusWsUrl, getHeliusApiUrl } from './config.js';
export {
    generatePrivacyMarket,
    generateMultipleMarkets,
    getMarketsByCategory,
    listCategories,
    PRIVACY_CATEGORIES
} from './privacy-markets.js';

// Helius integration
export { HeliusClient, createHeliusClient } from './helius/client.js';
export { TransactionTracker, createTransactionTracker } from './helius/transaction-tracker.js';
export { WebhookServer, createWebhookServer } from './helius/webhooks.js';

// Daemon mode
export { PrivacyOracleDaemon, createDaemon } from './daemon/index.js';
export { Scheduler, createScheduler } from './daemon/scheduler.js';
export { setupGracefulShutdown, HealthMonitor } from './daemon/lifecycle.js';

// Storage
export { MarketStore, createMarketStore } from './storage/market-store.js';

// Events
export { agentEvents, AgentEvents } from './events/emitter.js';

// Monitoring
export { NewsMonitor, createNewsMonitor, DEFAULT_NEWS_SOURCES } from './monitoring/news-monitor.js';
export { scoreRelevance, generateMarketFromNews, PRIVACY_KEYWORDS } from './monitoring/news-scorer.js';

// Analytics
export { DashboardAggregator, createAggregator, formatNumber, formatDuration } from './analytics/aggregator.js';

// Privacy tokens
export {
    TOKENS,
    PRIVACY_TOKEN_INFO,
    getCollateralMint,
    listSupportedTokens,
    checkConfidentialTransferSupport,
    getTokenInfo,
    formatTokenAmount,
    parseTokenAmount,
    getCollateralConfig
} from './collateral/privacy-tokens.js';

// CLI utilities
export {
    createSpinner,
    withSpinner,
    withProgress,
    createIndeterminateProgress,
    StepProgress,
    statusLine,
    successLine,
    errorLine,
    infoLine
} from './utils/spinner.js';

// Quick start function for programmatic use
export async function quickCreate(question, options = {}) {
    const { createAgent } = await import('./agent.js');
    const agent = await createAgent({ verbose: options.verbose });

    if (question) {
        return agent.createMarket({ question, ...options });
    } else {
        return agent.createPrivacyMarket(options);
    }
}

// Run agent as daemon (recommended over runAutonomous)
export async function startDaemon(config = {}) {
    const { PrivacyOracleDaemon } = await import('./daemon/index.js');
    const { getConfig } = await import('./config.js');

    const baseConfig = getConfig();
    const mergedConfig = {
        ...baseConfig,
        ...config,
        daemon: {
            ...baseConfig.daemon,
            ...config.daemon
        }
    };

    const daemon = new PrivacyOracleDaemon(mergedConfig);
    await daemon.start();

    return daemon;
}

// Legacy autonomous mode (use startDaemon instead)
export async function runAutonomous(config = {}) {
    console.warn('runAutonomous is deprecated. Use startDaemon for better functionality.');

    const { createAgent } = await import('./agent.js');
    const { generateMultipleMarkets } = await import('./privacy-markets.js');

    const count = config.count || 1;
    const interval = config.intervalMs || 3600000;

    const agent = await createAgent({ verbose: true });

    console.log(`Starting autonomous mode: ${count} markets every ${interval / 60000} minutes`);

    const createRound = async () => {
        const ideas = generateMultipleMarkets(count);

        for (const idea of ideas) {
            try {
                const result = await agent.createMarket({
                    question: idea.question,
                    durationDays: idea.durationDays,
                    liquidity: idea.suggestedLiquidity
                });

                console.log(`Created: ${result.market}`);
            } catch (error) {
                console.error(`Failed: ${error.message}`);
            }
        }
    };

    await createRound();

    if (config.continuous) {
        setInterval(createRound, interval);
    }
}
