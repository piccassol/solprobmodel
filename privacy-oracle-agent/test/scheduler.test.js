// Tests for scheduler.js
// Run with: node --test test/scheduler.test.js

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Scheduler, createScheduler } from '../src/daemon/scheduler.js';

describe('Scheduler', () => {
    let scheduler;

    afterEach(() => {
        if (scheduler) {
            scheduler.stop();
        }
    });

    describe('parseSchedule (internal)', () => {
        beforeEach(() => {
            scheduler = new Scheduler();
        });

        it('should parse minute intervals', () => {
            const result = scheduler.parseSchedule('30m');
            assert.strictEqual(result.type, 'interval');
            assert.strictEqual(result.ms, 30 * 60 * 1000);
        });

        it('should parse hour intervals', () => {
            const result = scheduler.parseSchedule('1h');
            assert.strictEqual(result.type, 'interval');
            assert.strictEqual(result.ms, 60 * 60 * 1000);
        });

        it('should parse day intervals', () => {
            const result = scheduler.parseSchedule('1d');
            assert.strictEqual(result.type, 'interval');
            assert.strictEqual(result.ms, 24 * 60 * 60 * 1000);
        });

        it('should parse second intervals', () => {
            const result = scheduler.parseSchedule('30s');
            assert.strictEqual(result.type, 'interval');
            assert.strictEqual(result.ms, 30 * 1000);
        });

        it('should parse cron expressions', () => {
            const result = scheduler.parseSchedule('* * * * *');
            assert.strictEqual(result.type, 'cron');
            assert.strictEqual(result.expression, '* * * * *');
        });

        it('should parse plain milliseconds', () => {
            const result = scheduler.parseSchedule('5000');
            assert.strictEqual(result.type, 'interval');
            assert.strictEqual(result.ms, 5000);
        });

        it('should throw for invalid format', () => {
            assert.throws(() => {
                scheduler.parseSchedule('invalid');
            }, /Invalid schedule format/);
        });
    });

    describe('Scheduler class', () => {
        it('should create with default config', () => {
            scheduler = new Scheduler();
            assert.ok(scheduler);
        });

        it('should add tasks', () => {
            scheduler = new Scheduler();

            scheduler.addTask({
                name: 'test',
                schedule: '1h',
                task: () => {}
            });

            const tasks = scheduler.getAllTasks();
            assert.strictEqual(tasks.length, 1);
            assert.strictEqual(tasks[0].name, 'test');
        });

        it('should remove tasks', () => {
            scheduler = new Scheduler();

            scheduler.addTask({
                name: 'test',
                schedule: '1h',
                task: () => {}
            });
            scheduler.removeTask('test');

            const tasks = scheduler.getAllTasks();
            assert.strictEqual(tasks.length, 0);
        });

        it('should run task immediately with runNow', async () => {
            scheduler = new Scheduler();
            let executed = false;

            scheduler.addTask({
                name: 'immediate',
                schedule: '1h',
                task: async () => {
                    executed = true;
                }
            });

            await scheduler.runNow('immediate');
            assert.ok(executed, 'task should have been executed');
        });

        it('should get next run time after starting', () => {
            scheduler = new Scheduler();

            scheduler.addTask({
                name: 'test',
                schedule: '1h',
                task: () => {}
            });

            scheduler.start();
            const nextRun = scheduler.getNextRun('test');

            assert.ok(nextRun);
            assert.ok(nextRun > Date.now());
        });

        it('should enable and disable tasks', () => {
            scheduler = new Scheduler();

            scheduler.addTask({
                name: 'test',
                schedule: '1h',
                task: () => {},
                enabled: true
            });

            scheduler.disableTask('test');
            let info = scheduler.getTaskInfo('test');
            assert.strictEqual(info.enabled, false);

            scheduler.enableTask('test');
            info = scheduler.getTaskInfo('test');
            assert.strictEqual(info.enabled, true);
        });

        it('should track run count', async () => {
            scheduler = new Scheduler();

            scheduler.addTask({
                name: 'counter',
                schedule: '1h',
                task: () => {}
            });

            await scheduler.runNow('counter');
            await scheduler.runNow('counter');

            const info = scheduler.getTaskInfo('counter');
            assert.strictEqual(info.runCount, 2);
        });

        it('should report running status', () => {
            scheduler = new Scheduler();

            assert.strictEqual(scheduler.isRunning(), false);

            scheduler.start();
            assert.strictEqual(scheduler.isRunning(), true);

            scheduler.stop();
            assert.strictEqual(scheduler.isRunning(), false);
        });
    });

    describe('createScheduler factory', () => {
        it('should create a scheduler instance', () => {
            scheduler = createScheduler();
            assert.ok(scheduler instanceof Scheduler);
        });
    });
});
