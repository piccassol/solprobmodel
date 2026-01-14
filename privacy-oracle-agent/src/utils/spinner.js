// CLI spinner and progress utilities
// Provides elegant loading indicators for long operations

import ora from 'ora';

// Default spinner configuration
const DEFAULT_CONFIG = {
    spinner: 'dots',
    color: 'cyan'
};

// Create a new spinner
export function createSpinner(text, config = {}) {
    return ora({
        text,
        ...DEFAULT_CONFIG,
        ...config
    });
}

// Execute a task with a spinner
export async function withSpinner(text, task, options = {}) {
    const spinner = createSpinner(text, options);
    spinner.start();

    try {
        const result = await task(spinner);
        spinner.succeed(options.successText || text);
        return result;
    } catch (error) {
        spinner.fail(options.failText || `${text} - ${error.message}`);
        if (!options.silent) {
            throw error;
        }
        return null;
    }
}

// Execute multiple tasks with progress
export async function withProgress(tasks, options = {}) {
    const results = [];
    const total = tasks.length;
    const spinner = createSpinner(`Processing 0/${total}...`, options);

    spinner.start();

    for (let i = 0; i < tasks.length; i++) {
        const { name, task } = tasks[i];
        spinner.text = `${name} (${i + 1}/${total})...`;

        try {
            const result = await task();
            results.push({ name, success: true, result });
        } catch (error) {
            results.push({ name, success: false, error: error.message });

            if (options.stopOnError) {
                spinner.fail(`Failed at: ${name}`);
                throw error;
            }
        }
    }

    const successCount = results.filter(r => r.success).length;
    spinner.succeed(`Completed ${successCount}/${total} tasks`);

    return results;
}

// Indeterminate progress for unknown duration tasks
export function createIndeterminateProgress(text) {
    const spinner = createSpinner(text);
    let elapsed = 0;
    let timer = null;

    return {
        start() {
            spinner.start();
            timer = setInterval(() => {
                elapsed++;
                spinner.text = `${text} (${elapsed}s)`;
            }, 1000);
            return this;
        },

        update(newText) {
            spinner.text = `${newText} (${elapsed}s)`;
            return this;
        },

        succeed(successText) {
            if (timer) clearInterval(timer);
            spinner.succeed(successText || `${text} (${elapsed}s)`);
            return this;
        },

        fail(failText) {
            if (timer) clearInterval(timer);
            spinner.fail(failText || `${text} failed after ${elapsed}s`);
            return this;
        },

        stop() {
            if (timer) clearInterval(timer);
            spinner.stop();
            return this;
        }
    };
}

// Step-by-step progress indicator
export class StepProgress {
    constructor(steps, options = {}) {
        this.steps = steps;
        this.currentStep = 0;
        this.spinner = createSpinner('', options);
        this.startTime = null;
    }

    start() {
        this.startTime = Date.now();
        this.updateSpinner();
        this.spinner.start();
        return this;
    }

    updateSpinner() {
        const step = this.steps[this.currentStep];
        const progress = `[${this.currentStep + 1}/${this.steps.length}]`;
        this.spinner.text = `${progress} ${step}`;
    }

    next(customText) {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            if (customText) {
                this.steps[this.currentStep] = customText;
            }
            this.updateSpinner();
        }
        return this;
    }

    succeed(text) {
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        this.spinner.succeed(text || `Completed ${this.steps.length} steps in ${elapsed}s`);
        return this;
    }

    fail(text) {
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);
        this.spinner.fail(text || `Failed at step ${this.currentStep + 1} after ${elapsed}s`);
        return this;
    }
}

// Simple text status updates (no spinner)
export function statusLine(text, symbol = '-') {
    console.log(`  ${symbol} ${text}`);
}

export function successLine(text) {
    statusLine(text, '\u2713');
}

export function errorLine(text) {
    statusLine(text, '\u2717');
}

export function infoLine(text) {
    statusLine(text, '\u2022');
}
