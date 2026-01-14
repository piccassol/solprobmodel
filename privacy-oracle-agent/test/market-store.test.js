// Tests for market-store.js (SQLite storage)
// Run with: node --test test/market-store.test.js

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createMarketStore } from '../src/storage/market-store.js';

describe('MarketStore (SQLite)', () => {
    let store;

    beforeEach(() => {
        // Use in-memory storage for tests
        store = createMarketStore(':memory:');
    });

    afterEach(() => {
        if (store) {
            store.close();
        }
    });

    describe('saveMarket', () => {
        it('should save a market record', () => {
            const market = {
                address: 'test123',
                question: 'Will privacy win?',
                category: 'Privacy Technology',
                categoryKey: 'technology',
                creationTime: Date.now(),
                creationSignature: 'sig123',
                initialLiquidity: '1000000',
                durationDays: 30
            };

            store.saveMarket(market);
            const retrieved = store.getMarket('test123');

            assert.strictEqual(retrieved.address, 'test123');
            assert.strictEqual(retrieved.question, 'Will privacy win?');
            assert.strictEqual(retrieved.category, 'Privacy Technology');
        });

        it('should update existing market on conflict', () => {
            const market = {
                address: 'test123',
                question: 'Original question',
                category: 'Tech',
                creationTime: Date.now()
            };

            store.saveMarket(market);
            store.saveMarket({ ...market, question: 'Updated question' });

            const retrieved = store.getMarket('test123');
            assert.strictEqual(retrieved.question, 'Updated question');
        });

        it('should calculate endTime from creationTime and durationDays', () => {
            const creationTime = Date.now();
            store.saveMarket({
                address: 'test123',
                question: 'Test',
                creationTime,
                durationDays: 30
            });

            const market = store.getMarket('test123');
            const expectedEndTime = creationTime + (30 * 24 * 60 * 60 * 1000);
            assert.strictEqual(market.endTime, expectedEndTime);
        });
    });

    describe('getMarket', () => {
        it('should return null for non-existent market', () => {
            const result = store.getMarket('nonexistent');
            assert.strictEqual(result, null);
        });
    });

    describe('getAllMarkets', () => {
        beforeEach(() => {
            // Add test markets
            for (let i = 0; i < 5; i++) {
                store.saveMarket({
                    address: `market${i}`,
                    question: `Question ${i}`,
                    category: i % 2 === 0 ? 'Tech' : 'Regulation',
                    categoryKey: i % 2 === 0 ? 'technology' : 'regulation',
                    status: i < 3 ? 'active' : 'resolved',
                    creationTime: Date.now() - (i * 86400000),
                    durationDays: 30
                });
            }
        });

        it('should return all markets', () => {
            const markets = store.getAllMarkets();
            assert.strictEqual(markets.length, 5);
        });

        it('should filter by status', () => {
            const active = store.getAllMarkets({ status: 'active' });
            assert.strictEqual(active.length, 3);

            const resolved = store.getAllMarkets({ status: 'resolved' });
            assert.strictEqual(resolved.length, 2);
        });

        it('should limit results', () => {
            const limited = store.getAllMarkets({ limit: 2 });
            assert.strictEqual(limited.length, 2);
        });

        it('should filter by category', () => {
            const tech = store.getAllMarkets({ category: 'technology' });
            assert.ok(tech.length > 0);
            tech.forEach(m => assert.strictEqual(m.categoryKey, 'technology'));
        });

        it('should sort by creation time (newest first)', () => {
            const markets = store.getAllMarkets();
            for (let i = 1; i < markets.length; i++) {
                assert.ok(markets[i - 1].creationTime >= markets[i].creationTime);
            }
        });
    });

    describe('updateMarket', () => {
        it('should update market fields', () => {
            store.saveMarket({
                address: 'test123',
                question: 'Test',
                status: 'active',
                creationTime: Date.now(),
                durationDays: 30
            });

            store.updateMarket('test123', {
                status: 'resolved',
                outcome: 'yes',
                resolutionTime: Date.now()
            });

            const market = store.getMarket('test123');
            assert.strictEqual(market.status, 'resolved');
            assert.strictEqual(market.outcome, 'yes');
        });

        it('should return null for non-existent market', () => {
            const result = store.updateMarket('nonexistent', { status: 'resolved' });
            assert.strictEqual(result, null);
        });
    });

    describe('deleteMarket', () => {
        it('should delete existing market', () => {
            store.saveMarket({
                address: 'test123',
                question: 'Test',
                creationTime: Date.now()
            });

            const deleted = store.deleteMarket('test123');
            assert.strictEqual(deleted, true);
            assert.strictEqual(store.getMarket('test123'), null);
        });

        it('should return false for non-existent market', () => {
            const deleted = store.deleteMarket('nonexistent');
            assert.strictEqual(deleted, false);
        });
    });

    describe('getStats', () => {
        beforeEach(() => {
            store.saveMarket({
                address: 'active1',
                question: 'Active market',
                category: 'Tech',
                categoryKey: 'technology',
                status: 'active',
                creationTime: Date.now(),
                durationDays: 30
            });

            store.saveMarket({
                address: 'resolved1',
                question: 'Resolved market',
                category: 'Regulation',
                categoryKey: 'regulation',
                status: 'resolved',
                creationTime: Date.now() - 86400000,
                durationDays: 30
            });
        });

        it('should return total count', () => {
            const stats = store.getStats();
            assert.strictEqual(stats.total, 2);
        });

        it('should count by status', () => {
            const stats = store.getStats();
            assert.strictEqual(stats.active, 1);
            assert.strictEqual(stats.resolved, 1);
        });

        it('should group by category', () => {
            const stats = store.getStats();
            assert.ok(stats.byCategory.length > 0);

            const techCount = stats.byCategory.find(c => c.category_key === 'technology');
            assert.ok(techCount);
            assert.strictEqual(techCount.count, 1);
        });

        it('should count recent markets', () => {
            const stats = store.getStats();
            assert.strictEqual(stats.recentCount, 2);
        });
    });

    describe('getPerformanceMetrics', () => {
        it('should return zero metrics for empty store', () => {
            const metrics = store.getPerformanceMetrics();
            assert.strictEqual(metrics.totalVolume, '0');
            assert.strictEqual(metrics.marketCount, 0);
        });

        it('should calculate metrics for resolved markets', () => {
            store.saveMarket({
                address: 'test1',
                question: 'Test',
                status: 'resolved',
                volume: '1000000',
                durationDays: 30,
                creationTime: Date.now()
            });

            const metrics = store.getPerformanceMetrics();
            assert.strictEqual(metrics.totalVolume, '1000000');
            assert.strictEqual(metrics.marketCount, 1);
        });
    });

    describe('saveState and getState', () => {
        it('should persist and retrieve daemon state (object API)', () => {
            const state = {
                lastRun: Date.now(),
                marketCount: 10,
                config: { schedule: '1h' }
            };

            store.saveState(state);
            const retrieved = store.getState();

            assert.strictEqual(retrieved.lastRun, state.lastRun);
            assert.strictEqual(retrieved.marketCount, state.marketCount);
            assert.deepStrictEqual(retrieved.config, state.config);
        });

        it('should persist and retrieve daemon state (key-value API)', () => {
            store.saveState('lastRun', Date.now());
            store.saveState('count', 5);

            const lastRun = store.getState('lastRun');
            const count = store.getState('count');

            assert.ok(lastRun);
            assert.strictEqual(count, 5);
        });

        it('should return null if no state saved', () => {
            const state = store.getState();
            assert.strictEqual(state, null);
        });
    });

    describe('webhook events', () => {
        it('should save webhook events', () => {
            store.saveWebhookEvent({
                type: 'MARKET_CREATED',
                signature: 'sig123',
                data: { market: 'market123' }
            });

            const events = store.getWebhookEvents();
            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].event_type, 'MARKET_CREATED');
        });

        it('should mark events as processed', () => {
            store.saveWebhookEvent({
                type: 'TEST',
                signature: 'sig1',
                data: {}
            });

            const events = store.getWebhookEvents();
            store.markWebhookProcessed(events[0].id);

            const processed = store.getWebhookEvents({ processed: true });
            assert.strictEqual(processed.length, 1);
        });
    });

    describe('clear', () => {
        it('should clear all data', () => {
            store.saveMarket({
                address: 'test',
                question: 'Test',
                creationTime: Date.now()
            });

            store.clear();

            assert.strictEqual(store.getAllMarkets().length, 0);
        });
    });

    describe('export and import', () => {
        it('should export data as JSON', () => {
            store.saveMarket({
                address: 'test',
                question: 'Test',
                creationTime: Date.now()
            });

            const exported = store.export();
            const parsed = JSON.parse(exported);

            assert.ok(parsed.markets);
            assert.ok(Array.isArray(parsed.markets));
            assert.strictEqual(parsed.markets.length, 1);
        });

        it('should import data from JSON', () => {
            const data = {
                markets: [
                    {
                        address: 'imported',
                        question: 'Imported market',
                        creationTime: Date.now(),
                        durationDays: 30
                    }
                ]
            };

            store.import(JSON.stringify(data));
            const market = store.getMarket('imported');

            assert.ok(market);
            assert.strictEqual(market.question, 'Imported market');
        });
    });
});
