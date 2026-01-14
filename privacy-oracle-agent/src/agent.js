import { PublicKey } from '@solana/web3.js';
import { PNPClient } from 'pnp-sdk';
import { getConfig, validateConfig } from './config.js';
import { generatePrivacyMarket, generateMultipleMarkets } from './privacy-markets.js';

export class PrivacyOracleAgent {
    constructor(options = {}) {
        this.config = options.config || getConfig();
        this.client = null;
        this.initialized = false;
        this.verbose = options.verbose || false;
    }

    log(message, level = 'info') {
        if (this.verbose || level === 'error') {
            const prefix = level === 'error' ? '[ERROR]' : '[INFO]';
            console.log(`${prefix} ${message}`);
        }
    }

    async initialize() {
        if (this.initialized) return;

        const validation = validateConfig(this.config);
        
        if (validation.warnings.length > 0) {
            validation.warnings.forEach(w => this.log(w, 'warn'));
        }

        if (!validation.valid && this.config.walletKey) {
            throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
        }

        this.log(`Connecting to ${this.config.network} via Helius RPC...`);
        
        if (this.config.walletKey) {
            let privateKey = this.config.walletKey;
            
            if (typeof privateKey === 'string') {
                if (privateKey.startsWith('[')) {
                    privateKey = Uint8Array.from(JSON.parse(privateKey));
                }
            }
            
            this.client = new PNPClient(this.config.rpcUrl, privateKey);
            this.log('Client initialized with signer');
        } else {
            this.client = new PNPClient(this.config.rpcUrl);
            this.log('Client initialized in read-only mode');
        }

        this.initialized = true;
    }

    async createMarket(options) {
        await this.initialize();

        if (!this.client.market) {
            throw new Error('Market module not available. Ensure wallet is configured.');
        }

        const question = options.question;
        const durationDays = options.durationDays || this.config.defaultDurationDays;
        const liquidity = options.liquidity || this.config.defaultLiquidity;

        const endTime = BigInt(Math.floor(Date.now() / 1000) + (durationDays * 24 * 60 * 60));

        this.log(`Creating market: "${question}"`);
        this.log(`Duration: ${durationDays} days, Liquidity: ${liquidity}`);

        const result = await this.client.market.createMarket({
            question,
            initialLiquidity: liquidity,
            endTime,
            baseMint: this.config.collateralMint
        });

        return {
            success: true,
            signature: result.signature,
            market: result.market?.toBase58?.() || result.market?.toString?.() || result.market,
            question,
            durationDays,
            liquidity: liquidity.toString()
        };
    }

    async createP2PMarket(options) {
        await this.initialize();

        const question = options.question;
        const side = options.side || 'yes';
        const amount = options.amount || this.config.defaultLiquidity;
        const cap = options.cap || amount * 5n;
        const durationDays = options.durationDays || this.config.defaultDurationDays;

        const endTime = BigInt(Math.floor(Date.now() / 1000) + (durationDays * 24 * 60 * 60));

        this.log(`Creating P2P market: "${question}"`);
        this.log(`Side: ${side}, Amount: ${amount}, Cap: ${cap}`);

        const result = await this.client.createP2PMarketGeneral({
            question,
            initialAmount: amount,
            side,
            creatorSideCap: cap,
            endTime,
            collateralTokenMint: this.config.collateralMint
        });

        return {
            success: true,
            signature: result.signature,
            market: result.market,
            yesTokenMint: result.yesTokenMint,
            noTokenMint: result.noTokenMint,
            question,
            side,
            durationDays
        };
    }

    async createPrivacyMarket(options = {}) {
        const marketIdea = generatePrivacyMarket();
        
        this.log(`Generated market idea: ${marketIdea.category}`);
        
        return this.createMarket({
            question: options.question || marketIdea.question,
            durationDays: options.durationDays || marketIdea.durationDays,
            liquidity: options.liquidity || marketIdea.suggestedLiquidity
        });
    }

    async createBatchMarkets(count = 3) {
        await this.initialize();

        const ideas = generateMultipleMarkets(count);
        const results = [];

        for (const idea of ideas) {
            try {
                this.log(`Creating: "${idea.question}"`);
                
                const result = await this.createMarket({
                    question: idea.question,
                    durationDays: idea.durationDays,
                    liquidity: idea.suggestedLiquidity
                });
                
                results.push({ ...result, category: idea.category });
                
                await this.sleep(2000);
                
            } catch (error) {
                results.push({
                    success: false,
                    question: idea.question,
                    error: error.message
                });
            }
        }

        return results;
    }

    async fetchMarkets() {
        await this.initialize();
        
        try {
            const response = await this.client.fetchMarkets();
            return response;
        } catch (error) {
            this.log(`Error fetching markets: ${error.message}`, 'error');
            throw error;
        }
    }

    async fetchMarketInfo(marketAddress) {
        await this.initialize();

        const market = new PublicKey(marketAddress);
        const info = await this.client.fetchMarket(market);

        return {
            address: marketAddress,
            question: info.account.question,
            creator: new PublicKey(info.account.creator).toBase58(),
            resolved: info.account.resolved,
            resolvable: info.account.resolvable,
            endTime: new Date(Number(info.account.end_time) * 1000),
            winningToken: info.account.winning_token_id || null
        };
    }

    async getMarketAddresses() {
        await this.initialize();
        return this.client.fetchMarketAddresses();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export async function createAgent(options = {}) {
    const agent = new PrivacyOracleAgent(options);
    await agent.initialize();
    return agent;
}
