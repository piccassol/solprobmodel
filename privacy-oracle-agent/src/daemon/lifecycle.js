// Graceful shutdown and signal handling for daemon mode
// Ensures state is saved and resources are cleaned up

import { agentEvents, AgentEvents } from '../events/emitter.js';

export function setupGracefulShutdown(daemon, options = {}) {
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    let shuttingDown = false;
    const timeout = options.timeout || 30000;

    const shutdown = async (signal) => {
        if (shuttingDown) {
            console.log('Shutdown already in progress...');
            return;
        }

        shuttingDown = true;
        console.log(`\nReceived ${signal}, shutting down gracefully...`);

        // Set a hard timeout
        const hardTimeout = setTimeout(() => {
            console.error('Shutdown timeout exceeded, forcing exit');
            process.exit(1);
        }, timeout);

        try {
            agentEvents.emitTyped(AgentEvents.DAEMON_STOPPED, {
                signal,
                reason: 'graceful_shutdown'
            });

            await daemon.stop();
            console.log('Daemon stopped successfully');

            clearTimeout(hardTimeout);
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error.message);
            clearTimeout(hardTimeout);
            process.exit(1);
        }
    };

    // Register signal handlers
    for (const signal of signals) {
        process.on(signal, () => shutdown(signal));
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
        console.error('Uncaught exception:', error);

        agentEvents.emitTyped(AgentEvents.DAEMON_ERROR, {
            type: 'uncaughtException',
            error: error.message,
            stack: error.stack
        });

        try {
            if (daemon.saveState) {
                await daemon.saveState();
            }
        } catch (saveError) {
            console.error('Failed to save state:', saveError.message);
        }

        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
        console.error('Unhandled rejection at:', promise, 'reason:', reason);

        agentEvents.emitTyped(AgentEvents.DAEMON_ERROR, {
            type: 'unhandledRejection',
            error: String(reason)
        });

        try {
            if (daemon.saveState) {
                await daemon.saveState();
            }
        } catch (saveError) {
            console.error('Failed to save state:', saveError.message);
        }

        process.exit(1);
    });

    return {
        shutdown,
        isShuttingDown: () => shuttingDown
    };
}

// Health check helper for long-running processes
export class HealthMonitor {
    constructor(options = {}) {
        this.checkInterval = options.checkInterval || 60000;
        this.maxMemoryMB = options.maxMemoryMB || 512;
        this.onUnhealthy = options.onUnhealthy || null;
        this.timer = null;
        this.startTime = Date.now();
        this.lastCheck = null;
    }

    start() {
        this.timer = setInterval(() => this.check(), this.checkInterval);
        return this;
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        return this;
    }

    check() {
        const health = this.getHealth();
        this.lastCheck = Date.now();

        if (!health.healthy && this.onUnhealthy) {
            this.onUnhealthy(health);
        }

        return health;
    }

    getHealth() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);

        const uptime = Date.now() - this.startTime;
        const memoryOk = heapUsedMB < this.maxMemoryMB;

        return {
            healthy: memoryOk,
            uptime,
            uptimeHuman: this.formatUptime(uptime),
            memory: {
                heapUsedMB,
                rssMB,
                maxMB: this.maxMemoryMB
            },
            lastCheck: this.lastCheck,
            issues: memoryOk ? [] : ['Memory usage exceeded threshold']
        };
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}

export function createHealthMonitor(options) {
    return new HealthMonitor(options);
}
