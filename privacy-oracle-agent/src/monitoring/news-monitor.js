// RSS feed parsing for privacy-related news monitoring
// Provides context for timely market generation

import Parser from 'rss-parser';
import { agentEvents, AgentEvents } from '../events/emitter.js';
import { scoreRelevance, PRIVACY_KEYWORDS } from './news-scorer.js';

// Default privacy news sources
const DEFAULT_SOURCES = [
    {
        name: 'EFF',
        url: 'https://www.eff.org/rss/updates.xml',
        keywords: ['privacy', 'encryption', 'surveillance', 'data protection', 'FISA'],
        weight: 1.0
    },
    {
        name: 'Decrypt',
        url: 'https://decrypt.co/feed',
        keywords: ['privacy', 'zk', 'zero-knowledge', 'tornado', 'zcash', 'monero', 'mixer'],
        weight: 0.9
    },
    {
        name: 'CoinDesk',
        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
        keywords: ['privacy', 'regulation', 'sanctions', 'compliance', 'OFAC'],
        weight: 0.7
    },
    {
        name: 'The Block',
        url: 'https://www.theblock.co/rss.xml',
        keywords: ['privacy', 'zk-rollup', 'confidential', 'anonymous'],
        weight: 0.8
    }
];

export class NewsMonitor {
    constructor(config = {}) {
        this.sources = config.sources || DEFAULT_SOURCES;
        this.parser = new Parser({
            timeout: 10000,
            headers: {
                'User-Agent': 'PrivacyOracleAgent/1.0'
            }
        });
        this.checkInterval = config.checkInterval || 300000; // 5 minutes
        this.recentEvents = [];
        this.maxEvents = config.maxEvents || 100;
        this.seenIds = new Set();
        this.timer = null;
        this.isRunning = false;
        this.lastCheck = null;
        this.errorCount = 0;
    }

    async start() {
        if (this.isRunning) return this;

        this.isRunning = true;

        // Initial check
        await this.checkFeeds();

        // Schedule periodic checks
        this.timer = setInterval(() => this.checkFeeds(), this.checkInterval);

        return this;
    }

    async stop() {
        this.isRunning = false;

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        return this;
    }

    async checkFeeds() {
        if (!this.isRunning) return;

        this.lastCheck = Date.now();
        const newEvents = [];

        for (const source of this.sources) {
            try {
                const feed = await this.parser.parseURL(source.url);

                for (const item of feed.items || []) {
                    const id = item.guid || item.link || item.title;

                    if (this.seenIds.has(id)) continue;

                    const event = this.processItem(item, source);

                    // Only keep events with relevance score >= 30
                    if (event.relevanceScore >= 30) {
                        this.addEvent(event);
                        newEvents.push(event);

                        agentEvents.emitTyped(AgentEvents.NEWS_EVENT, event);
                    }

                    this.seenIds.add(id);

                    // Limit seen IDs to prevent memory growth
                    if (this.seenIds.size > 10000) {
                        const idsArray = Array.from(this.seenIds);
                        this.seenIds = new Set(idsArray.slice(-5000));
                    }
                }
            } catch (error) {
                this.errorCount++;
                console.error(`Failed to fetch ${source.name}:`, error.message);
            }
        }

        agentEvents.emitTyped(AgentEvents.NEWS_CHECK_COMPLETE, {
            sourcesChecked: this.sources.length,
            newEventsFound: newEvents.length,
            totalEvents: this.recentEvents.length,
            errorCount: this.errorCount
        });

        return newEvents;
    }

    processItem(item, source) {
        const title = item.title || '';
        const content = item.contentSnippet || item.content || '';
        const text = `${title} ${content}`.toLowerCase();

        const { score, matchedKeywords, suggestedCategory, urgency } = scoreRelevance(
            text,
            source.keywords,
            source.weight
        );

        return {
            id: item.guid || item.link || `${source.name}-${Date.now()}`,
            title: title,
            link: item.link || '',
            source: source.name,
            publishedAt: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            relevanceScore: score,
            matchedKeywords,
            suggestedCategory,
            urgency,
            snippet: content.slice(0, 200)
        };
    }

    addEvent(event) {
        this.recentEvents.unshift(event);

        if (this.recentEvents.length > this.maxEvents) {
            this.recentEvents = this.recentEvents.slice(0, this.maxEvents);
        }
    }

    getRecentEvents(limit = 10) {
        return this.recentEvents.slice(0, limit);
    }

    getEventsByCategory(category, limit = 10) {
        return this.recentEvents
            .filter(e => e.suggestedCategory === category)
            .slice(0, limit);
    }

    getHighUrgencyEvents(limit = 5) {
        return this.recentEvents
            .filter(e => e.urgency === 'breaking' || e.urgency === 'timely')
            .slice(0, limit);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            sourcesCount: this.sources.length,
            eventsCount: this.recentEvents.length,
            lastCheck: this.lastCheck,
            errorCount: this.errorCount,
            seenIdsCount: this.seenIds.size
        };
    }

    // Add a custom news source
    addSource(source) {
        if (!source.name || !source.url) {
            throw new Error('Source requires name and url');
        }

        this.sources.push({
            keywords: PRIVACY_KEYWORDS,
            weight: 0.5,
            ...source
        });

        return this;
    }

    // Remove a news source
    removeSource(name) {
        this.sources = this.sources.filter(s => s.name !== name);
        return this;
    }
}

export function createNewsMonitor(config) {
    return new NewsMonitor(config);
}

// Mock news source for testing
export class MockNewsSource {
    constructor() {
        this.events = [
            {
                title: 'EU Proposes New Digital Privacy Framework with Strict Encryption Rules',
                relevanceScore: 85,
                suggestedCategory: 'regulation',
                urgency: 'timely'
            },
            {
                title: 'Major ZK Protocol Reaches $1B TVL Milestone',
                relevanceScore: 90,
                suggestedCategory: 'technology',
                urgency: 'breaking'
            },
            {
                title: 'Signal Reports Record User Growth Amid Privacy Concerns',
                relevanceScore: 75,
                suggestedCategory: 'adoption',
                urgency: 'timely'
            },
            {
                title: 'Data Breach Affects 50M Users at Major Tech Company',
                relevanceScore: 80,
                suggestedCategory: 'events',
                urgency: 'breaking'
            },
            {
                title: 'Tornado Cash Developer Case Reaches New Development',
                relevanceScore: 95,
                suggestedCategory: 'regulation',
                urgency: 'breaking'
            }
        ];
    }

    async getEvents(limit = 5) {
        return this.events.slice(0, limit).map(e => ({
            ...e,
            id: `mock-${Math.random().toString(36).slice(2)}`,
            link: 'https://example.com',
            source: 'mock',
            publishedAt: Date.now(),
            matchedKeywords: ['privacy']
        }));
    }
}
