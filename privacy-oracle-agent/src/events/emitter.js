// Central event bus for agent status updates and coordination
// Uses Node.js EventEmitter with typed events

import { EventEmitter } from 'events';

// Event type constants
export const AgentEvents = {
    // Daemon lifecycle
    DAEMON_STARTED: 'daemon:started',
    DAEMON_STOPPED: 'daemon:stopped',
    DAEMON_ERROR: 'daemon:error',

    // Cycle events
    CYCLE_START: 'cycle:start',
    CYCLE_COMPLETE: 'cycle:complete',
    CYCLE_ERROR: 'cycle:error',

    // Market events
    MARKET_CREATED: 'market:created',
    MARKET_FAILED: 'market:failed',
    MARKET_RESOLVED: 'market:resolved',
    MARKET_UPDATED: 'market:updated',

    // Transaction events
    TX_SENT: 'tx:sent',
    TX_CONFIRMED: 'tx:confirmed',
    TX_FAILED: 'tx:failed',

    // News events
    NEWS_EVENT: 'news:event',
    NEWS_CHECK_COMPLETE: 'news:check:complete',

    // Webhook events
    WEBHOOK_RECEIVED: 'webhook:received',
    WEBHOOK_SERVER_STARTED: 'webhook:server:started',
    WEBHOOK_SERVER_STOPPED: 'webhook:server:stopped',
    HELIUS_EVENT: 'helius:event',

    // State events
    STATE_SAVED: 'state:saved',
    STATE_RESTORED: 'state:restored',

    // Analytics events
    STATS_UPDATED: 'stats:updated'
};

class AgentEventEmitter extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
        this.eventHistory = [];
        this.maxHistorySize = 100;
    }

    // Emit with timestamp and optional metadata
    emitTyped(event, payload = {}) {
        const eventData = {
            type: event,
            timestamp: Date.now(),
            ...payload
        };

        // Store in history
        this.eventHistory.unshift(eventData);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.pop();
        }

        this.emit(event, eventData);
        return this;
    }

    // Get recent events of a specific type
    getRecentEvents(type = null, limit = 10) {
        let events = this.eventHistory;

        if (type) {
            events = events.filter(e => e.type === type);
        }

        return events.slice(0, limit);
    }

    // Clear event history
    clearHistory() {
        this.eventHistory = [];
    }

    // Subscribe to multiple events
    onMany(events, handler) {
        for (const event of events) {
            this.on(event, handler);
        }
        return this;
    }

    // One-time subscription to multiple events
    onceAny(events, handler) {
        const wrappedHandler = (data) => {
            // Remove all listeners after first event
            for (const event of events) {
                this.off(event, wrappedHandler);
            }
            handler(data);
        };

        for (const event of events) {
            this.on(event, wrappedHandler);
        }
        return this;
    }

    // Wait for a specific event with timeout
    waitFor(event, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, handler);
                reject(new Error(`Timeout waiting for event: ${event}`));
            }, timeout);

            const handler = (data) => {
                clearTimeout(timer);
                resolve(data);
            };

            this.once(event, handler);
        });
    }
}

// Singleton instance
export const agentEvents = new AgentEventEmitter();

// Helper to create scoped event emitters
export function createScopedEmitter(scope) {
    return {
        emit: (event, payload) => {
            agentEvents.emitTyped(`${scope}:${event}`, payload);
        },
        on: (event, handler) => {
            agentEvents.on(`${scope}:${event}`, handler);
        },
        off: (event, handler) => {
            agentEvents.off(`${scope}:${event}`, handler);
        }
    };
}
