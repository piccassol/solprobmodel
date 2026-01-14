// Tests for privacy-markets.js
// Run with: node --test test/privacy-markets.test.js

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    generatePrivacyMarket,
    generateMultipleMarkets,
    getMarketsByCategory,
    listCategories,
    PRIVACY_CATEGORIES
} from '../src/privacy-markets.js';

describe('Privacy Markets', () => {
    describe('generatePrivacyMarket', () => {
        it('should generate a market with required fields', () => {
            const market = generatePrivacyMarket();

            assert.ok(market.question, 'should have a question');
            assert.ok(market.category, 'should have a category');
            assert.ok(market.categoryKey, 'should have a categoryKey');
            assert.ok(typeof market.durationDays === 'number', 'durationDays should be a number');
            assert.ok(typeof market.suggestedLiquidity === 'bigint', 'suggestedLiquidity should be bigint');
        });

        it('should generate questions with filled placeholders', () => {
            const market = generatePrivacyMarket();

            assert.ok(!market.question.includes('{country}'), 'should not have {country} placeholder');
            assert.ok(!market.question.includes('{company}'), 'should not have {company} placeholder');
            assert.ok(!market.question.includes('{amount}'), 'should not have {amount} placeholder');
            assert.ok(!market.question.includes('{date}'), 'should not have {date} placeholder');
            assert.ok(!market.question.includes('{year}'), 'should not have {year} placeholder');
        });

        it('should return valid category key', () => {
            const market = generatePrivacyMarket();
            const validKeys = Object.keys(PRIVACY_CATEGORIES);

            assert.ok(validKeys.includes(market.categoryKey), `categoryKey should be one of ${validKeys.join(', ')}`);
        });

        it('should generate duration between 14 and 180 days', () => {
            for (let i = 0; i < 20; i++) {
                const market = generatePrivacyMarket();
                assert.ok(market.durationDays >= 14, 'duration should be at least 14 days');
                assert.ok(market.durationDays <= 180, 'duration should be at most 180 days');
            }
        });
    });

    describe('generateMultipleMarkets', () => {
        it('should generate the requested number of markets', () => {
            const markets = generateMultipleMarkets(5);
            assert.strictEqual(markets.length, 5);
        });

        it('should generate unique questions', () => {
            const markets = generateMultipleMarkets(10);
            const questions = markets.map(m => m.question);
            const uniqueQuestions = new Set(questions);

            assert.strictEqual(uniqueQuestions.size, questions.length, 'all questions should be unique');
        });

        it('should use default count of 5', () => {
            const markets = generateMultipleMarkets();
            assert.strictEqual(markets.length, 5);
        });
    });

    describe('getMarketsByCategory', () => {
        it('should return markets for regulation category', () => {
            const markets = getMarketsByCategory('regulation');

            assert.ok(markets.length > 0, 'should return markets');
            markets.forEach(m => {
                assert.strictEqual(m.categoryKey, 'regulation');
                assert.strictEqual(m.category, 'Privacy Regulation');
            });
        });

        it('should return markets for technology category', () => {
            const markets = getMarketsByCategory('technology');

            assert.ok(markets.length > 0, 'should return markets');
            markets.forEach(m => {
                assert.strictEqual(m.categoryKey, 'technology');
            });
        });

        it('should throw for unknown category', () => {
            assert.throws(() => {
                getMarketsByCategory('unknown');
            }, /Unknown category/);
        });
    });

    describe('listCategories', () => {
        it('should return all categories', () => {
            const categories = listCategories();

            assert.strictEqual(categories.length, 4);
            assert.ok(categories.some(c => c.key === 'regulation'));
            assert.ok(categories.some(c => c.key === 'technology'));
            assert.ok(categories.some(c => c.key === 'adoption'));
            assert.ok(categories.some(c => c.key === 'events'));
        });

        it('should include weights that sum to 1', () => {
            const categories = listCategories();
            const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);

            assert.ok(Math.abs(totalWeight - 1) < 0.01, `weights should sum to 1, got ${totalWeight}`);
        });

        it('should include template counts', () => {
            const categories = listCategories();

            categories.forEach(c => {
                assert.ok(c.templateCount > 0, `${c.key} should have templates`);
            });
        });
    });

    describe('PRIVACY_CATEGORIES', () => {
        it('should have urgency and sentiment for each category', () => {
            for (const [key, cat] of Object.entries(PRIVACY_CATEGORIES)) {
                assert.ok(cat.urgency, `${key} should have urgency`);
                assert.ok(cat.sentiment, `${key} should have sentiment`);
                assert.ok(['breaking', 'timely', 'evergreen'].includes(cat.urgency),
                    `${key} urgency should be valid`);
                assert.ok(['bullish', 'bearish', 'neutral'].includes(cat.sentiment),
                    `${key} sentiment should be valid`);
            }
        });

        it('should have multiple templates per category', () => {
            for (const [key, cat] of Object.entries(PRIVACY_CATEGORIES)) {
                assert.ok(cat.templates.length >= 5, `${key} should have at least 5 templates`);
            }
        });
    });
});
