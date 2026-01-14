// Helius webhook server for receiving real-time blockchain events
// Express server with endpoints for market event notifications

import express from 'express';
import { agentEvents, AgentEvents } from '../events/emitter.js';

export class WebhookServer {
    constructor(config = {}) {
        this.port = config.port || 3000;
        this.authToken = config.authToken || process.env.WEBHOOK_AUTH_TOKEN;
        this.app = express();
        this.server = null;
        this.eventHandlers = new Map();

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));

        // Auth middleware for webhook endpoints
        this.app.use('/webhook', (req, res, next) => {
            if (this.authToken) {
                const auth = req.headers['authorization'];
                if (auth !== this.authToken) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
            }
            next();
        });

        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                if (req.path.startsWith('/webhook')) {
                    agentEvents.emitTyped(AgentEvents.WEBHOOK_RECEIVED, {
                        path: req.path,
                        method: req.method,
                        statusCode: res.statusCode,
                        duration
                    });
                }
            });
            next();
        });
    }

    setupRoutes() {
        // Helius webhook endpoint
        this.app.post('/webhook/helius', async (req, res) => {
            try {
                const events = Array.isArray(req.body) ? req.body : [req.body];
                const processed = [];

                for (const event of events) {
                    try {
                        await this.processHeliusEvent(event);
                        processed.push({ success: true, signature: event.signature });
                    } catch (error) {
                        processed.push({ success: false, error: error.message });
                    }
                }

                res.status(200).json({
                    success: true,
                    processed: processed.length,
                    results: processed
                });
            } catch (error) {
                console.error('Webhook processing error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: Date.now(),
                uptime: process.uptime()
            });
        });

        // Analytics endpoint for dashboard
        this.app.get('/api/stats', async (req, res) => {
            try {
                const handler = this.eventHandlers.get('getStats');
                if (handler) {
                    const stats = await handler();
                    res.json(stats);
                } else {
                    res.json({ message: 'Stats handler not configured' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Recent markets endpoint
        this.app.get('/api/markets', async (req, res) => {
            try {
                const handler = this.eventHandlers.get('getMarkets');
                if (handler) {
                    const limit = parseInt(req.query.limit) || 20;
                    const status = req.query.status || null;
                    const markets = await handler({ limit, status });
                    res.json(markets);
                } else {
                    res.json([]);
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Not found' });
        });
    }

    async processHeliusEvent(event) {
        // Extract event type and process accordingly
        const eventType = event.type || 'UNKNOWN';
        const signature = event.signature;

        // Emit for any listeners
        agentEvents.emitTyped(AgentEvents.HELIUS_EVENT, {
            type: eventType,
            signature,
            data: event
        });

        // Handle specific event types
        switch (eventType) {
            case 'CREATE_MARKET':
                await this.handleMarketCreation(event);
                break;
            case 'SWAP':
                await this.handleSwap(event);
                break;
            case 'TRANSFER':
                await this.handleTransfer(event);
                break;
            default:
                // Generic event handling
                const handler = this.eventHandlers.get(eventType);
                if (handler) {
                    await handler(event);
                }
        }

        return { processed: true, type: eventType };
    }

    async handleMarketCreation(event) {
        const handler = this.eventHandlers.get('marketCreated');
        if (handler) {
            await handler(event);
        }
    }

    async handleSwap(event) {
        const handler = this.eventHandlers.get('swap');
        if (handler) {
            await handler(event);
        }
    }

    async handleTransfer(event) {
        const handler = this.eventHandlers.get('transfer');
        if (handler) {
            await handler(event);
        }
    }

    // Register custom event handlers
    on(eventType, handler) {
        this.eventHandlers.set(eventType, handler);
        return this;
    }

    // Remove event handler
    off(eventType) {
        this.eventHandlers.delete(eventType);
        return this;
    }

    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    console.log(`Webhook server listening on port ${this.port}`);
                    agentEvents.emitTyped(AgentEvents.WEBHOOK_SERVER_STARTED, {
                        port: this.port
                    });
                    resolve(this.port);
                });

                this.server.on('error', (error) => {
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('Webhook server stopped');
                    agentEvents.emitTyped(AgentEvents.WEBHOOK_SERVER_STOPPED, {});
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    getExpressApp() {
        return this.app;
    }
}

export function createWebhookServer(config) {
    return new WebhookServer(config);
}
