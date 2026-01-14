// Tests for Helius integration
// Run with: node --test test/helius.test.js

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { HeliusClient } from '../src/helius/client.js';
import { TransactionTracker } from '../src/helius/transaction-tracker.js';

describe('HeliusClient', () => {
    describe('constructor', () => {
        it('should throw without API key', () => {
            assert.throws(() => {
                new HeliusClient(null, 'devnet');
            }, /API key is required/);
        });

        it('should create client with API key', () => {
            const client = new HeliusClient('test-api-key', 'devnet');
            assert.ok(client);
            assert.strictEqual(client.apiKey, 'test-api-key');
        });

        it('should default to devnet', () => {
            const client = new HeliusClient('key');
            assert.strictEqual(client.network, 'devnet');
        });

        it('should use mainnet when specified', () => {
            const client = new HeliusClient('key', 'mainnet');
            assert.strictEqual(client.network, 'mainnet');
        });
    });

    describe('API URL construction', () => {
        it('should construct correct RPC URL for devnet', () => {
            const client = new HeliusClient('test-key', 'devnet');
            assert.ok(client.rpcUrl.includes('devnet'));
            assert.ok(client.rpcUrl.includes('test-key'));
        });

        it('should construct correct RPC URL for mainnet', () => {
            const client = new HeliusClient('test-key', 'mainnet');
            assert.ok(client.rpcUrl.includes('mainnet'));
        });
    });

    describe('webhook creation config', () => {
        it('should have methods for webhook management', () => {
            const client = new HeliusClient('key', 'devnet');

            assert.ok(typeof client.createWebhook === 'function');
            assert.ok(typeof client.listWebhooks === 'function');
            assert.ok(typeof client.deleteWebhook === 'function');
        });
    });
});

describe('TransactionTracker', () => {
    describe('constructor', () => {
        it('should create tracker with rpcUrl', () => {
            const tracker = new TransactionTracker({
                rpcUrl: 'https://api.devnet.solana.com'
            });
            assert.ok(tracker);
            assert.ok(tracker.connection);
        });
    });

    describe('configuration', () => {
        it('should have default retry config', () => {
            const tracker = new TransactionTracker({
                rpcUrl: 'https://api.devnet.solana.com'
            });
            assert.ok(tracker.maxRetries > 0);
            assert.ok(tracker.retryDelay > 0);
        });

        it('should respect custom retry config', () => {
            const tracker = new TransactionTracker({
                rpcUrl: 'https://api.devnet.solana.com',
                maxRetries: 10,
                retryDelay: 5000
            });

            assert.strictEqual(tracker.maxRetries, 10);
            assert.strictEqual(tracker.retryDelay, 5000);
        });
    });
});
