// Cron-style scheduling engine for autonomous agent operation
// Supports both cron expressions and interval strings

import cronParser from 'cron-parser';

export class Scheduler {
    constructor() {
        this.tasks = new Map();
        this.timers = new Map();
        this.running = false;
        this.taskRuns = new Map(); // Track execution counts
    }

    addTask(config) {
        const { name, schedule, task, runImmediately = false, enabled = true } = config;

        if (!name || !schedule || !task) {
            throw new Error('Task requires name, schedule, and task function');
        }

        const parsed = this.parseSchedule(schedule);

        this.tasks.set(name, {
            schedule: parsed,
            originalSchedule: schedule,
            task,
            runImmediately,
            enabled,
            lastRun: null,
            nextRun: null,
            runCount: 0,
            errors: []
        });

        return this;
    }

    removeTask(name) {
        const timer = this.timers.get(name);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(name);
        }
        this.tasks.delete(name);
        return this;
    }

    enableTask(name) {
        const task = this.tasks.get(name);
        if (task) {
            task.enabled = true;
            if (this.running) {
                this.scheduleNext(name, task);
            }
        }
        return this;
    }

    disableTask(name) {
        const task = this.tasks.get(name);
        if (task) {
            task.enabled = false;
            const timer = this.timers.get(name);
            if (timer) {
                clearTimeout(timer);
                this.timers.delete(name);
            }
        }
        return this;
    }

    parseSchedule(schedule) {
        // Support cron expressions (5 or 6 fields)
        if (schedule.includes('*') || schedule.split(' ').length >= 5) {
            return { type: 'cron', expression: schedule };
        }

        // Support interval strings like "30s", "5m", "1h", "2d"
        const match = schedule.match(/^(\d+)(s|m|h|d)$/i);
        if (match) {
            const multipliers = {
                s: 1000,
                m: 60 * 1000,
                h: 60 * 60 * 1000,
                d: 24 * 60 * 60 * 1000
            };
            const value = parseInt(match[1], 10);
            const unit = match[2].toLowerCase();
            return {
                type: 'interval',
                ms: value * multipliers[unit],
                original: schedule
            };
        }

        // Support plain milliseconds
        const ms = parseInt(schedule, 10);
        if (!isNaN(ms)) {
            return { type: 'interval', ms };
        }

        throw new Error(`Invalid schedule format: ${schedule}. Use cron expression or interval (e.g., "5m", "1h")`);
    }

    start() {
        if (this.running) return this;

        this.running = true;

        for (const [name, config] of this.tasks) {
            if (!config.enabled) continue;

            if (config.runImmediately) {
                this.executeTask(name, config);
            }
            this.scheduleNext(name, config);
        }

        return this;
    }

    stop() {
        this.running = false;

        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();

        return this;
    }

    scheduleNext(name, config) {
        if (!this.running || !config.enabled) return;

        let delay;

        if (config.schedule.type === 'interval') {
            delay = config.schedule.ms;
        } else {
            try {
                const interval = cronParser.parseExpression(config.schedule.expression);
                const nextDate = interval.next().toDate();
                delay = nextDate.getTime() - Date.now();

                // Ensure minimum delay of 1 second
                if (delay < 1000) {
                    delay = 1000;
                }
            } catch (error) {
                console.error(`Invalid cron expression for task ${name}:`, error.message);
                return;
            }
        }

        config.nextRun = Date.now() + delay;

        const timer = setTimeout(async () => {
            if (!this.running || !config.enabled) return;

            await this.executeTask(name, config);
            this.scheduleNext(name, config);
        }, delay);

        this.timers.set(name, timer);
    }

    async executeTask(name, config) {
        config.lastRun = Date.now();
        config.runCount++;

        try {
            await config.task();
        } catch (error) {
            config.errors.push({
                time: Date.now(),
                message: error.message
            });

            // Keep only last 10 errors
            if (config.errors.length > 10) {
                config.errors.shift();
            }

            console.error(`Task "${name}" failed:`, error.message);
        }
    }

    // Trigger immediate execution of a task
    async runNow(name) {
        const config = this.tasks.get(name);
        if (!config) {
            throw new Error(`Task not found: ${name}`);
        }

        await this.executeTask(name, config);
        return this;
    }

    getNextRun(taskName) {
        const config = this.tasks.get(taskName);
        if (!config) return null;

        return config.nextRun;
    }

    getTaskInfo(taskName) {
        const config = this.tasks.get(taskName);
        if (!config) return null;

        return {
            name: taskName,
            schedule: config.originalSchedule,
            enabled: config.enabled,
            lastRun: config.lastRun,
            nextRun: config.nextRun,
            runCount: config.runCount,
            recentErrors: config.errors.slice(-5)
        };
    }

    getAllTasks() {
        const tasks = [];
        for (const [name, config] of this.tasks) {
            tasks.push(this.getTaskInfo(name));
        }
        return tasks;
    }

    isRunning() {
        return this.running;
    }
}

export function createScheduler() {
    return new Scheduler();
}

// Helper to format next run time
export function formatNextRun(timestamp) {
    if (!timestamp) return 'Not scheduled';

    const now = Date.now();
    const diff = timestamp - now;

    if (diff < 0) return 'Overdue';
    if (diff < 60000) return `${Math.round(diff / 1000)}s`;
    if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h`;

    return new Date(timestamp).toLocaleString();
}
