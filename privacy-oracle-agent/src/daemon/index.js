// Main daemon orchestrator for autonomous market creation
// Coordinates agent, storage, scheduling, news monitoring, and webhooks

import { PrivacyOracleAgent } from '../agent.js';
import { Scheduler } from './scheduler.js';
import { setupGracefulShutdown, HealthMonitor } from './lifecycle.js';
import { agentEvents, AgentEvents } from '../events/emitter.js';
import { MarketStore } from '../storage/market-store.js';
import { NewsMonitor } from '../monitoring/news-monitor.js';
import { WebhookServer } from '../helius/webhooks.js';
import { getConfig } from '../config.js';

export class PrivacyOracleDaemon {
    constructor(config = {}) {
        this.config = {
            schedule: config.schedule || '1h',
            maxIterations: config.maxIterations || null,
            marketsPerRound: config.marketsPerRound || 1,
            dryRun: config.dryRun || false,
            enableNewsMonitoring: config.enableNewsMonitoring || false,
            enableWebhooks: config.enableWebhooks || false,
            webhookPort: config.webhookPort || 3000,
            storagePath: config.storagePath || null,
            verbose: config.verbose || false,
            ...config
        };

        this.agent = null;
        this.scheduler = new Scheduler();
        this.store = null;
        this.newsMonitor = null;
        this.webhookServer = null;
        this.healthMonitor = null;
        this.lifecycle = null;

        this.isRunning = false;
        this.iterationCount = 0;
        this.startTime = null;
    }

    log(message, level = 'info') {
        if (this.config.verbose || level === 'error') {
            const prefix = level === 'error' ? '[ERROR]' : '[DAEMON]';
            console.log(`${prefix} ${message}`);
        }
    }

    async start() {
        if (this.isRunning) {
            throw new Error('Daemon is already running');
        }

        this.startTime = Date.now();
        this.log('Starting Privacy Oracle Daemon...');

        // 1. Initialize agent
        const agentConfig = getConfig();
        this.agent = new PrivacyOracleAgent({
            config: agentConfig,
            verbose: this.config.verbose
        });
        await this.agent.initialize();
        this.log('Agent initialized');

        // 2. Initialize storage
        this.store = new MarketStore({ storagePath: this.config.storagePath });
        await this.store.initialize();
        this.log('Storage initialized');

        // 3. Restore state if available
        await this.restoreState();

        // 4. Setup graceful shutdown
        this.lifecycle = setupGracefulShutdown(this, { timeout: 30000 });

        // 5. Start health monitoring
        this.healthMonitor = new HealthMonitor({
            checkInterval: 60000,
            maxMemoryMB: 512,
            onUnhealthy: (health) => {
                this.log(`Health check failed: ${health.issues.join(', ')}`, 'error');
            }
        });
        this.healthMonitor.start();

        // 6. Optionally start news monitoring
        if (this.config.enableNewsMonitoring) {
            this.newsMonitor = new NewsMonitor();
            await this.newsMonitor.start();
            this.log('News monitoring started');
        }

        // 7. Optionally start webhook server
        if (this.config.enableWebhooks) {
            this.webhookServer = new WebhookServer({
                port: this.config.webhookPort,
                authToken: process.env.WEBHOOK_AUTH_TOKEN
            });

            // Register handlers
            this.webhookServer.on('getStats', () => this.store.getStats());
            this.webhookServer.on('getMarkets', (opts) => this.store.getAllMarkets(opts));

            await this.webhookServer.start();
            this.log(`Webhook server started on port ${this.config.webhookPort}`);
        }

        // 8. Schedule main market creation task
        this.scheduler.addTask({
            name: 'market-creation',
            schedule: this.config.schedule,
            task: () => this.executeCycle(),
            runImmediately: true
        });

        this.scheduler.start();
        this.isRunning = true;

        agentEvents.emitTyped(AgentEvents.DAEMON_STARTED, {
            config: this.config,
            startTime: this.startTime
        });

        this.log('Daemon started successfully');
        return this;
    }

    async executeCycle() {
        // Check iteration limit
        if (this.config.maxIterations && this.iterationCount >= this.config.maxIterations) {
            this.log(`Reached max iterations (${this.config.maxIterations}), stopping...`);
            await this.stop();
            return;
        }

        this.iterationCount++;
        const cycleStart = Date.now();

        agentEvents.emitTyped(AgentEvents.CYCLE_START, {
            iteration: this.iterationCount,
            timestamp: cycleStart
        });

        this.log(`Starting cycle ${this.iterationCount}...`);

        try {
            // Get news context if available
            let newsContext = null;
            if (this.newsMonitor) {
                newsContext = this.newsMonitor.getRecentEvents(5);
                if (newsContext.length > 0) {
                    this.log(`Found ${newsContext.length} relevant news events`);
                }
            }

            // Generate and create markets
            const results = [];

            if (this.config.dryRun) {
                // Dry run - just generate ideas
                const { generateMultipleMarkets } = await import('../privacy-markets.js');
                const ideas = generateMultipleMarkets(this.config.marketsPerRound);

                for (const idea of ideas) {
                    this.log(`[DRY RUN] Would create: ${idea.question}`);
                    results.push({
                        success: true,
                        dryRun: true,
                        question: idea.question,
                        category: idea.category
                    });
                }
            } else {
                // Actually create markets
                const batchResults = await this.agent.createBatchMarkets(this.config.marketsPerRound);

                for (const result of batchResults) {
                    if (result.success) {
                        // Store in database
                        await this.store.saveMarket({
                            address: result.market,
                            question: result.question,
                            category: result.category,
                            categoryKey: result.categoryKey,
                            creationTime: Date.now(),
                            creationSignature: result.signature,
                            initialLiquidity: result.liquidity,
                            durationDays: result.durationDays,
                            status: 'active',
                            metadata: { newsContext, iteration: this.iterationCount }
                        });

                        agentEvents.emitTyped(AgentEvents.MARKET_CREATED, result);
                        this.log(`Created market: ${result.market}`);
                    } else {
                        agentEvents.emitTyped(AgentEvents.MARKET_FAILED, result);
                        this.log(`Failed to create market: ${result.error}`, 'error');
                    }

                    results.push(result);
                }
            }

            // Save state after each cycle
            await this.saveState();

            const cycleDuration = Date.now() - cycleStart;

            agentEvents.emitTyped(AgentEvents.CYCLE_COMPLETE, {
                iteration: this.iterationCount,
                results,
                duration: cycleDuration,
                successCount: results.filter(r => r.success).length,
                failCount: results.filter(r => !r.success).length
            });

            this.log(`Cycle ${this.iterationCount} complete (${cycleDuration}ms)`);

        } catch (error) {
            agentEvents.emitTyped(AgentEvents.CYCLE_ERROR, {
                iteration: this.iterationCount,
                error: error.message
            });

            this.log(`Cycle ${this.iterationCount} failed: ${error.message}`, 'error');
        }
    }

    async stop() {
        if (!this.isRunning) return;

        this.log('Stopping daemon...');

        // Stop scheduler
        this.scheduler.stop();

        // Stop news monitoring
        if (this.newsMonitor) {
            await this.newsMonitor.stop();
        }

        // Stop webhook server
        if (this.webhookServer) {
            await this.webhookServer.stop();
        }

        // Stop health monitor
        if (this.healthMonitor) {
            this.healthMonitor.stop();
        }

        // Save final state
        await this.saveState();

        // Close storage
        if (this.store) {
            await this.store.close();
        }

        this.isRunning = false;

        agentEvents.emitTyped(AgentEvents.DAEMON_STOPPED, {
            totalIterations: this.iterationCount,
            uptime: Date.now() - this.startTime
        });

        this.log('Daemon stopped');
    }

    async saveState() {
        if (!this.store) return;

        const state = {
            iterationCount: this.iterationCount,
            lastRunTime: Date.now(),
            config: {
                schedule: this.config.schedule,
                marketsPerRound: this.config.marketsPerRound
            }
        };

        await this.store.saveState('daemon', state);
        agentEvents.emitTyped(AgentEvents.STATE_SAVED, state);
    }

    async restoreState() {
        if (!this.store) return null;

        try {
            const state = await this.store.getState('daemon');

            if (state) {
                this.iterationCount = state.iterationCount || 0;
                this.log(`Restored state: ${this.iterationCount} previous iterations`);

                agentEvents.emitTyped(AgentEvents.STATE_RESTORED, state);
                return state;
            }
        } catch (error) {
            this.log('No previous state found, starting fresh');
        }

        return null;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            iterationCount: this.iterationCount,
            startTime: this.startTime,
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            config: this.config,
            scheduler: this.scheduler.getAllTasks(),
            health: this.healthMonitor?.getHealth() || null
        };
    }
}

export function createDaemon(config) {
    return new PrivacyOracleDaemon(config);
}
