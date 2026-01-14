// Transaction confirmation tracking with enhanced Helius methods
// Provides reliable transaction confirmation with retries and status updates

import { Connection } from '@solana/web3.js';

export class TransactionTracker {
    constructor(config = {}) {
        this.rpcUrl = config.rpcUrl;
        this.heliusClient = config.heliusClient;
        this.connection = new Connection(this.rpcUrl, 'confirmed');
        this.maxRetries = config.maxRetries || 30;
        this.retryDelay = config.retryDelay || 2000;
        this.onStatusChange = config.onStatusChange || null;
    }

    async confirmTransaction(signature, options = {}) {
        const maxRetries = options.maxRetries || this.maxRetries;
        const retryDelay = options.retryDelay || this.retryDelay;
        const commitment = options.commitment || 'confirmed';

        this.emitStatus(signature, 'pending', 'Waiting for confirmation...');

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const status = await this.connection.getSignatureStatus(signature, {
                    searchTransactionHistory: true
                });

                if (status && status.value) {
                    const { confirmationStatus, err } = status.value;

                    if (err) {
                        this.emitStatus(signature, 'failed', `Transaction failed: ${JSON.stringify(err)}`);
                        return {
                            success: false,
                            signature,
                            error: err,
                            confirmationStatus
                        };
                    }

                    if (confirmationStatus === 'finalized') {
                        this.emitStatus(signature, 'finalized', 'Transaction finalized');
                        return {
                            success: true,
                            signature,
                            confirmationStatus: 'finalized',
                            slot: status.value.slot
                        };
                    }

                    if (confirmationStatus === 'confirmed' && commitment === 'confirmed') {
                        this.emitStatus(signature, 'confirmed', 'Transaction confirmed');
                        return {
                            success: true,
                            signature,
                            confirmationStatus: 'confirmed',
                            slot: status.value.slot
                        };
                    }

                    this.emitStatus(signature, 'processing', `Status: ${confirmationStatus} (attempt ${attempt}/${maxRetries})`);
                }
            } catch (error) {
                this.emitStatus(signature, 'retrying', `Retry ${attempt}/${maxRetries}: ${error.message}`);
            }

            if (attempt < maxRetries) {
                await this.sleep(retryDelay);
            }
        }

        this.emitStatus(signature, 'timeout', 'Confirmation timeout');
        return {
            success: false,
            signature,
            error: 'Confirmation timeout',
            confirmationStatus: 'unknown'
        };
    }

    async getTransactionDetails(signature) {
        // Try enhanced Helius API first for rich transaction data
        if (this.heliusClient) {
            try {
                const enhanced = await this.heliusClient.getEnhancedTransactions([signature]);
                if (enhanced && enhanced.length > 0) {
                    return {
                        enhanced: true,
                        data: enhanced[0]
                    };
                }
            } catch (error) {
                // Fall back to standard RPC
            }
        }

        // Standard RPC fallback
        const tx = await this.connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0
        });

        return {
            enhanced: false,
            data: tx
        };
    }

    async waitForTransaction(signature, options = {}) {
        const timeout = options.timeout || 60000;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const result = await this.confirmTransaction(signature, {
                maxRetries: 1,
                ...options
            });

            if (result.success || result.error) {
                return result;
            }

            await this.sleep(1000);
        }

        return {
            success: false,
            signature,
            error: 'Transaction wait timeout'
        };
    }

    async trackMultipleTransactions(signatures, options = {}) {
        const results = new Map();
        const pending = new Set(signatures);
        const maxWait = options.maxWait || 120000;
        const startTime = Date.now();

        while (pending.size > 0 && Date.now() - startTime < maxWait) {
            const statuses = await this.connection.getSignatureStatuses(
                Array.from(pending),
                { searchTransactionHistory: true }
            );

            for (let i = 0; i < statuses.value.length; i++) {
                const sig = Array.from(pending)[i];
                const status = statuses.value[i];

                if (status) {
                    if (status.err) {
                        results.set(sig, { success: false, error: status.err });
                        pending.delete(sig);
                    } else if (status.confirmationStatus === 'finalized' ||
                               status.confirmationStatus === 'confirmed') {
                        results.set(sig, { success: true, status: status.confirmationStatus });
                        pending.delete(sig);
                    }
                }
            }

            if (pending.size > 0) {
                await this.sleep(2000);
            }
        }

        // Mark remaining as timeout
        for (const sig of pending) {
            results.set(sig, { success: false, error: 'timeout' });
        }

        return results;
    }

    emitStatus(signature, status, message) {
        if (this.onStatusChange) {
            this.onStatusChange({
                signature,
                status,
                message,
                timestamp: Date.now()
            });
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export function createTransactionTracker(config) {
    return new TransactionTracker(config);
}
