// Tests for news-scorer.js
// Run with: node --test test/news-scorer.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    scoreRelevance,
    generateMarketFromNews,
    PRIVACY_KEYWORDS
} from '../src/monitoring/news-scorer.js';

describe('News Scorer', () => {
    describe('PRIVACY_KEYWORDS', () => {
        it('should have privacy-related keywords', () => {
            assert.ok(Object.keys(PRIVACY_KEYWORDS).length > 0);
            assert.ok('privacy' in PRIVACY_KEYWORDS);
            assert.ok('encryption' in PRIVACY_KEYWORDS);
            assert.ok('surveillance' in PRIVACY_KEYWORDS);
        });

        it('should have positive weights for all keywords', () => {
            for (const [keyword, weight] of Object.entries(PRIVACY_KEYWORDS)) {
                assert.ok(typeof weight === 'number', `${keyword} should have numeric weight`);
                assert.ok(weight > 0, `${keyword} weight should be positive`);
            }
        });
    });

    describe('scoreRelevance', () => {
        it('should return high score for privacy-heavy content', () => {
            const text = 'New Privacy Legislation Threatens Encryption. The government is considering laws that would ban end-to-end encryption and require backdoors in privacy tools.';

            const result = scoreRelevance(text);

            assert.ok(result.score > 10, `score ${result.score} should be significant for privacy content`);
            assert.ok(result.matchedKeywords.length > 0, 'should have matched keywords');
        });

        it('should return low score for unrelated content', () => {
            const text = 'Sports Team Wins Championship. The local basketball team won the championship game last night in overtime.';

            const result = scoreRelevance(text);

            assert.ok(result.score < 20, `score ${result.score} should be low for unrelated content`);
        });

        it('should suggest appropriate category for regulation content', () => {
            const text = 'GDPR Fine Hits Tech Giant. Regulators issued a massive GDPR fine for data privacy violations.';

            const result = scoreRelevance(text);

            assert.ok(result.suggestedCategory, 'should suggest category');
            assert.strictEqual(result.suggestedCategory, 'regulation');
        });

        it('should suggest technology category for tech content', () => {
            const text = 'New Zero Knowledge Proof Protocol Launches on Mainnet. Researchers announce breakthrough in ZK proofs for blockchain privacy.';

            const result = scoreRelevance(text);

            assert.ok(result.suggestedCategory, 'should suggest category');
            assert.strictEqual(result.suggestedCategory, 'technology');
        });

        it('should detect urgency for breaking news', () => {
            const text = 'BREAKING: Major Data Breach Affects Millions. A massive data breach has exposed personal information of millions of users.';

            const result = scoreRelevance(text);

            assert.strictEqual(result.urgency, 'breaking', 'breaking news should be detected as urgent');
        });

        it('should detect timely urgency for announcements', () => {
            const text = 'Privacy Protocol Announces Major Upgrade. The team releases new version with enhanced confidential transfers.';

            const result = scoreRelevance(text);

            assert.strictEqual(result.urgency, 'timely', 'announcements should be timely');
        });

        it('should return evergreen for general content', () => {
            const text = 'Overview of Privacy Technology in 2026. A look at the state of encryption and privacy tools.';

            const result = scoreRelevance(text);

            assert.strictEqual(result.urgency, 'evergreen', 'general content should be evergreen');
        });
    });

    describe('generateMarketFromNews', () => {
        it('should generate market question from news event', () => {
            const newsEvent = {
                title: 'Meta Faces Privacy Investigation',
                suggestedCategory: 'regulation',
                urgency: 'timely'
            };

            const market = generateMarketFromNews(newsEvent);

            assert.ok(market, 'should generate market');
            assert.ok(market.question, 'should have question');
            assert.ok(market.question.endsWith('?'), 'question should end with ?');
            assert.ok(market.durationDays > 0, 'should have duration');
        });

        it('should set shorter duration for breaking news', () => {
            const breakingNews = {
                title: 'Major Privacy Breach',
                suggestedCategory: 'events',
                urgency: 'breaking'
            };

            const market = generateMarketFromNews(breakingNews);

            assert.strictEqual(market.durationDays, 14, 'breaking news should have 14 day duration');
        });

        it('should set medium duration for timely news', () => {
            const timelyNews = {
                title: 'Privacy Protocol Launch',
                suggestedCategory: 'technology',
                urgency: 'timely'
            };

            const market = generateMarketFromNews(timelyNews);

            assert.strictEqual(market.durationDays, 30, 'timely news should have 30 day duration');
        });

        it('should set longer duration for evergreen news', () => {
            const evergreenNews = {
                title: 'Privacy Technology Overview',
                suggestedCategory: 'technology',
                urgency: 'evergreen'
            };

            const market = generateMarketFromNews(evergreenNews);

            assert.strictEqual(market.durationDays, 90, 'evergreen news should have 90 day duration');
        });

        it('should include source event reference', () => {
            const newsEvent = {
                title: 'Privacy Protocol Gets Major Upgrade',
                suggestedCategory: 'technology',
                urgency: 'timely'
            };

            const market = generateMarketFromNews(newsEvent);

            assert.ok(market.sourceEvent, 'should include source event');
            assert.strictEqual(market.sourceEvent.title, newsEvent.title);
        });
    });
});
