// Dashboard data aggregation for market analytics
// Collects and formats metrics for display and API endpoints

import { agentEvents, AgentEvents } from '../events/emitter.js';

export class DashboardAggregator {
    constructor(store) {
        this.store = store;
        this.cache = null;
        this.cacheExpiry = 60000; // 1 minute cache
        this.lastUpdate = 0;
    }

    async getOverview() {
        // Use cache if fresh
        if (this.cache && Date.now() - this.lastUpdate < this.cacheExpiry) {
            return this.cache;
        }

        const stats = await this.store.getStats();
        const recent = await this.store.getAllMarkets({ limit: 10 });
        const performance = await this.store.getPerformanceMetrics();

        const overview = {
            summary: {
                totalMarkets: stats.total,
                activeMarkets: stats.active,
                resolvedMarkets: stats.resolved,
                cancelledMarkets: stats.cancelled,
                recentWeek: stats.recentCount
            },
            categoryBreakdown: stats.byCategory.map(c => ({
                category: c.category,
                key: c.category_key,
                count: c.count,
                percentage: Math.round((c.count / stats.total) * 100)
            })),
            performance: {
                totalVolume: performance.totalVolume,
                averageDuration: performance.averageDuration,
                resolutionRate: performance.resolutionRate,
                resolvedCount: performance.marketCount
            },
            recentMarkets: recent.map(m => ({
                address: m.address,
                question: m.question,
                category: m.category,
                status: m.status,
                createdAt: m.creationTime,
                endTime: m.endTime
            })),
            lastUpdated: Date.now()
        };

        // Update cache
        this.cache = overview;
        this.lastUpdate = Date.now();

        agentEvents.emitTyped(AgentEvents.STATS_UPDATED, { overview });

        return overview;
    }

    async getPerformanceMetrics() {
        return this.store.getPerformanceMetrics();
    }

    async getCategoryStats() {
        const stats = await this.store.getStats();
        return stats.byCategory;
    }

    async getTimeSeriesData(period = '7d') {
        const now = Date.now();
        let since;

        switch (period) {
            case '24h':
                since = now - 24 * 60 * 60 * 1000;
                break;
            case '7d':
                since = now - 7 * 24 * 60 * 60 * 1000;
                break;
            case '30d':
                since = now - 30 * 24 * 60 * 60 * 1000;
                break;
            default:
                since = now - 7 * 24 * 60 * 60 * 1000;
        }

        const markets = await this.store.getAllMarkets({ since });

        // Group by day
        const dailyData = {};

        for (const market of markets) {
            const day = new Date(market.creationTime).toISOString().split('T')[0];

            if (!dailyData[day]) {
                dailyData[day] = {
                    date: day,
                    created: 0,
                    volume: 0n
                };
            }

            dailyData[day].created++;

            if (market.volume) {
                dailyData[day].volume += BigInt(market.volume);
            }
        }

        // Convert to array and sort
        return Object.values(dailyData)
            .map(d => ({
                ...d,
                volume: d.volume.toString()
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    async getActiveMarketsSummary() {
        const active = await this.store.getAllMarkets({ status: 'active' });

        // Sort by end time (closest to expiry first)
        active.sort((a, b) => a.endTime - b.endTime);

        return active.map(m => {
            const timeLeft = m.endTime - Date.now();
            const daysLeft = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));

            return {
                address: m.address,
                question: m.question,
                category: m.category,
                daysLeft: Math.max(0, daysLeft),
                endTime: m.endTime,
                status: daysLeft <= 0 ? 'expired' : daysLeft <= 7 ? 'expiring_soon' : 'active'
            };
        });
    }

    async getResolutionPendingMarkets() {
        const active = await this.store.getAllMarkets({ status: 'active' });
        const now = Date.now();

        // Filter markets past their end time
        return active
            .filter(m => m.endTime < now)
            .map(m => ({
                address: m.address,
                question: m.question,
                endedAt: new Date(m.endTime).toISOString(),
                daysPastEnd: Math.floor((now - m.endTime) / (24 * 60 * 60 * 1000))
            }));
    }

    // Invalidate cache
    invalidateCache() {
        this.cache = null;
        this.lastUpdate = 0;
    }
}

export function createAggregator(store) {
    return new DashboardAggregator(store);
}

// Format large numbers for display
export function formatNumber(num) {
    const n = BigInt(num);

    if (n >= 1000000000n) {
        return `${Number(n / 1000000000n).toFixed(1)}B`;
    }
    if (n >= 1000000n) {
        return `${Number(n / 1000000n).toFixed(1)}M`;
    }
    if (n >= 1000n) {
        return `${Number(n / 1000n).toFixed(1)}K`;
    }

    return n.toString();
}

// Format time duration
export function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}
