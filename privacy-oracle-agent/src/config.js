import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

dotenv.config();

// Token addresses
const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Get collateral mint based on config
function getCollateralMintAddress(network, tokenSymbol) {
    const isMainnet = network === 'mainnet';

    // If a specific token is configured, try to use it
    if (tokenSymbol && tokenSymbol !== 'USDC') {
        // Try to parse as public key
        try {
            return new PublicKey(tokenSymbol);
        } catch {
            // Fall back to USDC
        }
    }

    return new PublicKey(isMainnet ? USDC_MAINNET : USDC_DEVNET);
}

export function getConfig() {
    const network = process.env.NETWORK || 'devnet';
    const isMainnet = network === 'mainnet';

    const heliusKey = process.env.HELIUS_API_KEY;
    if (!heliusKey) {
        console.warn('Warning: HELIUS_API_KEY not set. Using public RPC (rate limited).');
    }

    const rpcUrl = heliusKey
        ? `https://${isMainnet ? 'mainnet' : 'devnet'}.helius-rpc.com/?api-key=${heliusKey}`
        : `https://api.${isMainnet ? 'mainnet-beta' : 'devnet'}.solana.com`;

    const walletKey = process.env.WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY;
    const collateralToken = process.env.COLLATERAL_TOKEN || 'USDC';

    return {
        // Network
        network,
        isMainnet,
        rpcUrl,
        heliusKey,
        walletKey,

        // Collateral
        collateralMint: getCollateralMintAddress(network, collateralToken),
        collateralToken,
        preferConfidential: process.env.PREFER_CONFIDENTIAL_COLLATERAL === 'true',

        // Market defaults
        defaultLiquidity: BigInt(process.env.DEFAULT_LIQUIDITY || '1000000'),
        defaultDurationDays: parseInt(process.env.DEFAULT_DURATION_DAYS || '30', 10),
        proxyBaseUrl: process.env.PNP_PROXY_URL || 'https://api.pnp.exchange',

        // Daemon settings
        daemon: {
            schedule: process.env.DAEMON_SCHEDULE || '1h',
            marketsPerRound: parseInt(process.env.DAEMON_MARKETS_PER_ROUND || '1', 10),
            storagePath: process.env.DAEMON_STORAGE_PATH || null
        },

        // News monitoring
        news: {
            enabled: process.env.NEWS_ENABLED === 'true',
            checkInterval: parseInt(process.env.NEWS_CHECK_INTERVAL || '300000', 10)
        },

        // Webhook server
        webhook: {
            enabled: process.env.WEBHOOK_ENABLED === 'true',
            port: parseInt(process.env.WEBHOOK_PORT || '3000', 10),
            authToken: process.env.WEBHOOK_AUTH_TOKEN || null
        }
    };
}

export function validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config.walletKey) {
        errors.push('WALLET_PRIVATE_KEY or PRIVATE_KEY is required for creating markets');
    }

    if (!config.heliusKey) {
        warnings.push('HELIUS_API_KEY not set - using public RPC (rate limited)');
    }

    if (config.webhook.enabled && !config.webhook.authToken) {
        warnings.push('WEBHOOK_AUTH_TOKEN not set - webhook endpoints are unprotected');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

// Get Helius websocket URL
export function getHeliusWsUrl(config) {
    if (!config.heliusKey) return null;

    const network = config.isMainnet ? 'mainnet' : 'devnet';
    return `wss://${network}.helius-rpc.com/?api-key=${config.heliusKey}`;
}

// Get Helius API URL (for REST endpoints)
export function getHeliusApiUrl() {
    return 'https://api.helius.xyz/v0';
}
