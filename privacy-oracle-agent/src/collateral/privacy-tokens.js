// Privacy token collateral support for prediction markets
// Supports Token-2022 confidential transfers and configurable collateral

import { PublicKey, Connection } from '@solana/web3.js';

// Known token addresses
export const TOKENS = {
    mainnet: {
        // Standard stablecoins
        USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',

        // Native SOL (wrapped)
        WSOL: 'So11111111111111111111111111111111111111112',

        // Token-2022 program ID for reference
        TOKEN_2022_PROGRAM: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
    },
    devnet: {
        // Devnet USDC
        USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',

        // Wrapped SOL
        WSOL: 'So11111111111111111111111111111111111111112',

        // Token-2022 program ID
        TOKEN_2022_PROGRAM: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
    }
};

// Privacy-focused token metadata
export const PRIVACY_TOKEN_INFO = {
    // These would be mints with confidential transfer extension enabled
    // In practice, you'd register actual Token-2022 confidential mints here
    description: `
        Privacy-focused collateral support for the PNP bounty requirement.

        Solana's native privacy mechanism is the Token-2022 Confidential Transfer extension,
        which provides:
        - Encrypted balances using ElGamal encryption
        - Zero-knowledge proofs for transfer validity
        - Optional auditor key for compliance

        To use privacy-focused collateral:
        1. Use a Token-2022 mint with confidential transfer extension enabled
        2. Configure the mint address in COLLATERAL_TOKEN env variable
        3. Ensure your wallet has configured confidential transfer on the account
    `
};

export function getCollateralMint(symbol, network = 'devnet') {
    const tokens = TOKENS[network] || TOKENS.devnet;

    // Check if it's a known symbol
    if (tokens[symbol]) {
        return new PublicKey(tokens[symbol]);
    }

    // Try to parse as a direct public key
    try {
        return new PublicKey(symbol);
    } catch {
        throw new Error(`Unknown token: ${symbol}. Use a token symbol (USDC, USDT) or a valid mint address.`);
    }
}

export function listSupportedTokens(network = 'devnet') {
    const tokens = TOKENS[network] || TOKENS.devnet;

    return Object.entries(tokens)
        .filter(([key]) => key !== 'TOKEN_2022_PROGRAM')
        .map(([symbol, address]) => ({
            symbol,
            address,
            network
        }));
}

// Check if a mint supports Token-2022 confidential transfers
export async function checkConfidentialTransferSupport(connection, mintAddress) {
    try {
        const mint = new PublicKey(mintAddress);
        const accountInfo = await connection.getAccountInfo(mint);

        if (!accountInfo) {
            return { supported: false, reason: 'Mint account not found' };
        }

        // Check if owned by Token-2022 program
        const token2022Program = new PublicKey(TOKENS.mainnet.TOKEN_2022_PROGRAM);
        const isToken2022 = accountInfo.owner.equals(token2022Program);

        if (!isToken2022) {
            return {
                supported: false,
                reason: 'Not a Token-2022 mint',
                isToken2022: false
            };
        }

        // Token-2022 mints have extension data
        // The confidential transfer extension has type discriminator 10
        // This is a simplified check - full implementation would parse extensions
        const hasExtensions = accountInfo.data.length > 82; // Base mint is 82 bytes

        return {
            supported: hasExtensions,
            isToken2022: true,
            reason: hasExtensions
                ? 'Token-2022 mint with extensions (may support confidential transfers)'
                : 'Token-2022 mint without extensions'
        };
    } catch (error) {
        return {
            supported: false,
            reason: `Error checking mint: ${error.message}`
        };
    }
}

// Get token info including decimals
export async function getTokenInfo(connection, mintAddress) {
    try {
        const mint = new PublicKey(mintAddress);
        const accountInfo = await connection.getAccountInfo(mint);

        if (!accountInfo) {
            throw new Error('Mint not found');
        }

        // Parse basic mint data (works for both Token and Token-2022)
        // Mint structure: mintAuthorityOption (4) + mintAuthority (32) + supply (8) + decimals (1) + ...
        const data = accountInfo.data;
        const decimals = data[44]; // Offset to decimals field

        return {
            address: mintAddress,
            decimals,
            owner: accountInfo.owner.toBase58()
        };
    } catch (error) {
        throw new Error(`Failed to get token info: ${error.message}`);
    }
}

// Format amount with decimals
export function formatTokenAmount(amount, decimals) {
    const divisor = BigInt(10 ** decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;

    if (fractionalPart === 0n) {
        return wholePart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmed = fractionalStr.replace(/0+$/, '');

    return `${wholePart}.${trimmed}`;
}

// Parse amount string to base units
export function parseTokenAmount(amountStr, decimals) {
    const [whole, fraction = ''] = amountStr.split('.');
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);

    return BigInt(whole + paddedFraction);
}

// Collateral configuration helper
export function getCollateralConfig(config = {}) {
    const network = config.network || process.env.NETWORK || 'devnet';
    const tokenSymbol = config.token || process.env.COLLATERAL_TOKEN || 'USDC';

    const mint = getCollateralMint(tokenSymbol, network);

    return {
        mint,
        symbol: tokenSymbol,
        network,
        preferConfidential: config.preferConfidential || process.env.PREFER_CONFIDENTIAL_COLLATERAL === 'true'
    };
}
