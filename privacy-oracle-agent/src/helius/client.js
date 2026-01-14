// Helius API client for enhanced Solana interactions
// Provides DAS API, enhanced transactions, and webhook management

const HELIUS_API_BASE = 'https://api.helius.xyz/v0';

export class HeliusClient {
    constructor(apiKey, network = 'devnet') {
        if (!apiKey) {
            throw new Error('Helius API key is required');
        }
        this.apiKey = apiKey;
        this.network = network;
        this.rpcUrl = `https://${network === 'mainnet' ? 'mainnet' : 'devnet'}.helius-rpc.com/?api-key=${apiKey}`;
    }

    // DAS API Methods

    async getAssetsByOwner(ownerAddress, options = {}) {
        const response = await this.dasRequest('getAssetsByOwner', {
            ownerAddress,
            page: options.page || 1,
            limit: options.limit || 50,
            sortBy: options.sortBy || { sortBy: 'created', sortDirection: 'desc' },
            options: {
                showFungible: options.showFungible || false,
                showNativeBalance: options.showNativeBalance || false
            }
        });
        return response.result;
    }

    async searchAssets(params) {
        const response = await this.dasRequest('searchAssets', params);
        return response.result;
    }

    async getSignaturesForAsset(assetId, options = {}) {
        const response = await this.dasRequest('getSignaturesForAsset', {
            id: assetId,
            page: options.page || 1,
            limit: options.limit || 100
        });
        return response.result;
    }

    async getAsset(assetId) {
        const response = await this.dasRequest('getAsset', { id: assetId });
        return response.result;
    }

    // Enhanced Transactions API

    async getEnhancedTransactions(signatures) {
        if (!Array.isArray(signatures)) {
            signatures = [signatures];
        }

        const response = await fetch(`${HELIUS_API_BASE}/transactions?api-key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: signatures })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Helius API error: ${error}`);
        }

        return response.json();
    }

    async getEnhancedTransactionsByAddress(address, options = {}) {
        const params = new URLSearchParams({
            'api-key': this.apiKey
        });

        if (options.type) params.append('type', options.type);
        if (options.before) params.append('before', options.before);
        if (options.until) params.append('until', options.until);

        const response = await fetch(
            `${HELIUS_API_BASE}/addresses/${address}/transactions?${params}`,
            { method: 'GET' }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Helius API error: ${error}`);
        }

        return response.json();
    }

    // Webhook Management

    async createWebhook(config) {
        const webhookType = this.network === 'mainnet' ? 'enhanced' : 'enhancedDevnet';

        const response = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                webhookURL: config.url,
                transactionTypes: config.transactionTypes || ['ANY'],
                accountAddresses: config.addresses || [],
                webhookType: config.type || webhookType,
                authHeader: config.authToken || undefined
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to create webhook: ${error}`);
        }

        return response.json();
    }

    async listWebhooks() {
        const response = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${this.apiKey}`, {
            method: 'GET'
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to list webhooks: ${error}`);
        }

        return response.json();
    }

    async getWebhook(webhookId) {
        const response = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${this.apiKey}`, {
            method: 'GET'
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to get webhook: ${error}`);
        }

        return response.json();
    }

    async updateWebhook(webhookId, config) {
        const response = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${this.apiKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to update webhook: ${error}`);
        }

        return response.json();
    }

    async deleteWebhook(webhookId) {
        const response = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${this.apiKey}`, {
            method: 'DELETE'
        });

        return response.ok;
    }

    // Priority Fee API

    async getPriorityFeeEstimate(params = {}) {
        const response = await fetch(`${HELIUS_API_BASE}/priority-fee?api-key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountKeys: params.accountKeys || [],
                options: {
                    priorityLevel: params.priorityLevel || 'Medium'
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to get priority fee: ${error}`);
        }

        return response.json();
    }

    // Internal helper for DAS API requests

    async dasRequest(method, params) {
        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method,
                params
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`DAS API error: ${error}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(`DAS API error: ${result.error.message}`);
        }

        return result;
    }
}

export function createHeliusClient(apiKey, network) {
    return new HeliusClient(apiKey, network);
}
