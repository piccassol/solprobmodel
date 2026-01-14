// SQLite storage for market tracking
// Uses better-sqlite3 for synchronous, fast SQLite operations

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { agentEvents, AgentEvents } from '../events/emitter.js';

export class MarketStore {
    constructor(dbPath = null) {
        this.dbPath = dbPath;

        if (dbPath && dbPath !== ':memory:') {
            const dir = dirname(dbPath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        }

        this.db = new Database(dbPath || ':memory:');
        this.db.pragma('journal_mode = WAL');
        this._initSchema();
    }

    _initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS markets (
                address TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                category TEXT,
                category_key TEXT,
                creation_time INTEGER,
                creation_signature TEXT,
                initial_liquidity TEXT,
                duration_days INTEGER,
                end_time INTEGER,
                status TEXT DEFAULT 'active',
                outcome TEXT,
                volume TEXT,
                resolution_time INTEGER,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS daemon_state (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS webhook_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT,
                signature TEXT,
                data TEXT,
                processed INTEGER DEFAULT 0,
                timestamp INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
            CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category_key);
            CREATE INDEX IF NOT EXISTS idx_markets_creation ON markets(creation_time);
            CREATE INDEX IF NOT EXISTS idx_webhook_processed ON webhook_events(processed);
        `);
    }

    // Initialize (for API compatibility)
    async initialize() {
        return this;
    }

    // Save a market record
    saveMarket(record) {
        const endTime = record.endTime || (record.creationTime + (record.durationDays * 24 * 60 * 60 * 1000));

        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO markets
            (address, question, category, category_key, creation_time, creation_signature,
             initial_liquidity, duration_days, end_time, status, outcome, volume, resolution_time, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            record.address,
            record.question,
            record.category || null,
            record.categoryKey || null,
            record.creationTime || Date.now(),
            record.creationSignature || null,
            record.initialLiquidity?.toString() || null,
            record.durationDays || null,
            endTime,
            record.status || 'active',
            record.outcome || null,
            record.volume?.toString() || null,
            record.resolutionTime || null,
            JSON.stringify(record.metadata || {})
        );

        agentEvents.emitTyped(AgentEvents.MARKET_UPDATED, { address: record.address });

        return this.getMarket(record.address);
    }

    // Get a single market by address
    getMarket(address) {
        const stmt = this.db.prepare('SELECT * FROM markets WHERE address = ?');
        const row = stmt.get(address);

        if (!row) return null;

        return this._rowToMarket(row);
    }

    // Convert database row to market object
    _rowToMarket(row) {
        return {
            address: row.address,
            question: row.question,
            category: row.category,
            categoryKey: row.category_key,
            creationTime: row.creation_time,
            creationSignature: row.creation_signature,
            initialLiquidity: row.initial_liquidity,
            durationDays: row.duration_days,
            endTime: row.end_time,
            status: row.status,
            outcome: row.outcome,
            volume: row.volume,
            resolutionTime: row.resolution_time,
            metadata: row.metadata ? JSON.parse(row.metadata) : {}
        };
    }

    // Get all markets with optional filters
    getAllMarkets(options = {}) {
        let sql = 'SELECT * FROM markets WHERE 1=1';
        const params = [];

        if (options.status) {
            sql += ' AND status = ?';
            params.push(options.status);
        }

        if (options.category) {
            sql += ' AND category_key = ?';
            params.push(options.category);
        }

        if (options.since) {
            sql += ' AND creation_time >= ?';
            params.push(options.since);
        }

        if (options.until) {
            sql += ' AND creation_time <= ?';
            params.push(options.until);
        }

        sql += ' ORDER BY creation_time DESC';

        if (options.limit) {
            sql += ' LIMIT ?';
            params.push(options.limit);

            if (options.offset) {
                sql += ' OFFSET ?';
                params.push(options.offset);
            }
        }

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);

        return rows.map(row => this._rowToMarket(row));
    }

    // Update a market
    updateMarket(address, updates) {
        const market = this.getMarket(address);
        if (!market) return null;

        const fieldMap = {
            status: 'status',
            outcome: 'outcome',
            volume: 'volume',
            resolutionTime: 'resolution_time',
            resolution_time: 'resolution_time'
        };

        const setClauses = [];
        const params = [];

        for (const [key, value] of Object.entries(updates)) {
            const dbField = fieldMap[key] || key;
            setClauses.push(`${dbField} = ?`);
            params.push(value);
        }

        if (setClauses.length > 0) {
            params.push(address);
            const stmt = this.db.prepare(`UPDATE markets SET ${setClauses.join(', ')} WHERE address = ?`);
            stmt.run(...params);
        }

        agentEvents.emitTyped(AgentEvents.MARKET_UPDATED, { address, updates });

        return this.getMarket(address);
    }

    // Delete a market
    deleteMarket(address) {
        const stmt = this.db.prepare('DELETE FROM markets WHERE address = ?');
        const result = stmt.run(address);
        return result.changes > 0;
    }

    // Get statistics
    getStats() {
        const now = Date.now();
        const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

        const total = this.db.prepare('SELECT COUNT(*) as count FROM markets').get().count;
        const active = this.db.prepare('SELECT COUNT(*) as count FROM markets WHERE status = ?').get('active').count;
        const resolved = this.db.prepare('SELECT COUNT(*) as count FROM markets WHERE status = ?').get('resolved').count;
        const cancelled = this.db.prepare('SELECT COUNT(*) as count FROM markets WHERE status = ?').get('cancelled').count;
        const recentCount = this.db.prepare('SELECT COUNT(*) as count FROM markets WHERE creation_time >= ?').get(weekAgo).count;

        const byCategory = this.db.prepare(`
            SELECT category, category_key, COUNT(*) as count
            FROM markets
            GROUP BY category_key
        `).all();

        return {
            total,
            active,
            resolved,
            cancelled,
            recentCount,
            byCategory,
            lastUpdated: Date.now()
        };
    }

    // Get performance metrics
    getPerformanceMetrics() {
        const resolved = this.db.prepare('SELECT * FROM markets WHERE status = ?').all('resolved');

        const volumeResult = this.db.prepare('SELECT SUM(CAST(volume AS INTEGER)) as total FROM markets').get();
        const totalVolume = BigInt(volumeResult.total || 0);

        let averageDuration = 0;
        if (resolved.length > 0) {
            const totalDays = resolved.reduce((sum, m) => sum + (m.duration_days || 0), 0);
            averageDuration = totalDays / resolved.length;
        }

        const total = this.db.prepare('SELECT COUNT(*) as count FROM markets').get().count;
        const resolutionRate = total > 0 ? resolved.length / total : 0;

        return {
            totalVolume: totalVolume.toString(),
            averageDuration: Math.round(averageDuration),
            resolutionRate: Math.round(resolutionRate * 100) / 100,
            marketCount: resolved.length
        };
    }

    // Save daemon state
    saveState(keyOrState, value) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO daemon_state (key, value, updated_at)
            VALUES (?, ?, ?)
        `);

        if (typeof keyOrState === 'string') {
            stmt.run(keyOrState, JSON.stringify(value), Date.now());
        } else {
            // Old API: saveState(stateObject)
            const stateObj = { ...keyOrState, savedAt: Date.now() };
            stmt.run('__full_state__', JSON.stringify(stateObj), Date.now());
        }

        agentEvents.emitTyped(AgentEvents.STATE_SAVED, {});
    }

    // Get daemon state
    getState(key) {
        if (key) {
            const stmt = this.db.prepare('SELECT value FROM daemon_state WHERE key = ?');
            const row = stmt.get(key);
            return row ? JSON.parse(row.value) : null;
        }

        // Return full state object for old API
        const stmt = this.db.prepare('SELECT value FROM daemon_state WHERE key = ?');
        const row = stmt.get('__full_state__');
        return row ? JSON.parse(row.value) : null;
    }

    // Get all state
    getAllState() {
        const stmt = this.db.prepare('SELECT key, value FROM daemon_state');
        const rows = stmt.all();

        const state = {};
        for (const row of rows) {
            if (row.key === '__full_state__') {
                Object.assign(state, JSON.parse(row.value));
            } else {
                state[row.key] = JSON.parse(row.value);
            }
        }

        return state;
    }

    // Save webhook event
    saveWebhookEvent(event) {
        const stmt = this.db.prepare(`
            INSERT INTO webhook_events (event_type, signature, data, processed, timestamp)
            VALUES (?, ?, ?, 0, ?)
        `);

        stmt.run(
            event.type,
            event.signature,
            JSON.stringify(event.data),
            Date.now()
        );
    }

    // Log webhook event (alias)
    logWebhookEvent(eventType, signature, data) {
        this.saveWebhookEvent({ type: eventType, signature, data });
    }

    // Get webhook events
    getWebhookEvents(filtersOrLimit = {}) {
        if (typeof filtersOrLimit === 'number') {
            const stmt = this.db.prepare('SELECT * FROM webhook_events ORDER BY timestamp DESC LIMIT ?');
            return stmt.all(filtersOrLimit);
        }

        const filters = filtersOrLimit;
        let sql = 'SELECT * FROM webhook_events WHERE 1=1';
        const params = [];

        if (filters.eventType) {
            sql += ' AND event_type = ?';
            params.push(filters.eventType);
        }

        if (filters.processed !== undefined) {
            sql += ' AND processed = ?';
            params.push(filters.processed ? 1 : 0);
        }

        sql += ' ORDER BY timestamp DESC';

        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }

        const stmt = this.db.prepare(sql);
        return stmt.all(...params);
    }

    // Mark webhook as processed
    markWebhookProcessed(id) {
        const stmt = this.db.prepare('UPDATE webhook_events SET processed = 1 WHERE id = ?');
        stmt.run(id);
    }

    // Close database
    close() {
        this.db.close();
    }

    // Clear all data
    clear() {
        this.db.exec('DELETE FROM markets');
        this.db.exec('DELETE FROM daemon_state');
        this.db.exec('DELETE FROM webhook_events');
    }

    // Export data as JSON string
    export() {
        const markets = this.getAllMarkets();
        const state = this.getAllState();
        const events = this.getWebhookEvents(1000);

        return JSON.stringify({ markets, state, events }, null, 2);
    }

    // Import data from JSON string
    import(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            if (data.markets) {
                for (const market of data.markets) {
                    this.saveMarket(market);
                }
            }

            return true;
        } catch {
            return false;
        }
    }
}

// Factory function
export function createMarketStore(dbPath = null) {
    return new MarketStore(dbPath);
}
