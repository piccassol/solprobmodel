#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { PrivacyOracleAgent } from './agent.js';
import { generatePrivacyMarket, generateMultipleMarkets, listCategories, getMarketsByCategory, PRIVACY_CATEGORIES } from './privacy-markets.js';
import { getConfig, validateConfig } from './config.js';
import { PrivacyOracleDaemon } from './daemon/index.js';
import { createMarketStore } from './storage/market-store.js';
import { createAggregator, formatNumber, formatDuration } from './analytics/aggregator.js';
import { withSpinner, StepProgress, successLine, errorLine, infoLine } from './utils/spinner.js';
import { listSupportedTokens, checkConfidentialTransferSupport } from './collateral/privacy-tokens.js';
import { Connection } from '@solana/web3.js';

const program = new Command();

program
    .name('privacy-oracle')
    .description('AI agent for creating privacy-themed prediction markets on Solana')
    .version('1.1.0');

program
    .command('create')
    .description('Create a new privacy-themed prediction market')
    .option('-q, --question <question>', 'Custom market question')
    .option('-d, --days <days>', 'Duration in days', '30')
    .option('-l, --liquidity <amount>', 'Initial liquidity in base units', '1000000')
    .option('--p2p', 'Create as P2P market instead of AMM')
    .option('--side <side>', 'Side for P2P market (yes/no)', 'yes')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
        try {
            const config = getConfig();
            const validation = validateConfig(config);

            if (!validation.valid) {
                validation.errors.forEach(e => errorLine(e));
                process.exit(1);
            }

            validation.warnings.forEach(w => console.log(chalk.yellow('Warning:'), w));

            const agent = new PrivacyOracleAgent({ verbose: options.verbose });

            const steps = new StepProgress([
                'Generating market question',
                'Building transaction',
                'Submitting to Solana',
                'Confirming transaction'
            ]);

            steps.start();

            let result;
            if (options.p2p) {
                steps.next('Creating P2P market');
                result = await agent.createP2PMarket({
                    question: options.question,
                    durationDays: parseInt(options.days, 10),
                    amount: BigInt(options.liquidity),
                    side: options.side
                });
            } else {
                result = await agent.createPrivacyMarket({
                    question: options.question,
                    durationDays: parseInt(options.days, 10),
                    liquidity: BigInt(options.liquidity)
                });
            }

            steps.succeed('Market created successfully!');

            console.log();
            successLine(`Question: ${result.question}`);
            infoLine(`Market: ${result.market}`);
            infoLine(`Signature: ${result.signature}`);
            infoLine(`Duration: ${result.durationDays} days`);

        } catch (error) {
            console.error(chalk.red('\nError:'), error.message);
            if (error.logs) {
                console.error(chalk.gray('Transaction logs:'), error.logs.join('\n'));
            }
            process.exit(1);
        }
    });

program
    .command('batch')
    .description('Create multiple privacy-themed markets')
    .option('-c, --count <count>', 'Number of markets to create', '3')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
        try {
            const config = getConfig();
            const validation = validateConfig(config);

            if (!validation.valid) {
                validation.errors.forEach(e => errorLine(e));
                process.exit(1);
            }

            const agent = new PrivacyOracleAgent({ verbose: options.verbose });
            const count = parseInt(options.count, 10);

            console.log(chalk.cyan(`\nCreating ${count} privacy-themed markets...\n`));

            const results = await withSpinner(
                `Creating ${count} markets`,
                async (spinner) => {
                    const results = [];
                    for (let i = 0; i < count; i++) {
                        spinner.text = `Creating market ${i + 1}/${count}...`;
                        try {
                            const result = await agent.createPrivacyMarket({});
                            results.push({ ...result, success: true });
                        } catch (error) {
                            results.push({ success: false, error: error.message });
                        }
                    }
                    return results;
                },
                { successText: `Created ${count} markets` }
            );

            console.log();
            let successCount = 0;
            for (const result of results) {
                if (result.success) {
                    successCount++;
                    successLine(result.question);
                    console.log(chalk.gray(`     Market: ${result.market}`));
                } else {
                    errorLine(result.error || 'Unknown error');
                }
            }

            console.log(chalk.cyan(`\nCompleted: ${successCount}/${count} markets created successfully`));

        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('generate')
    .description('Generate market ideas without creating them')
    .option('-c, --count <count>', 'Number of ideas to generate', '5')
    .option('-k, --category <category>', 'Filter by category (regulation, technology, adoption, events)')
    .action((options) => {
        const count = parseInt(options.count, 10);

        let ideas;
        if (options.category) {
            if (!PRIVACY_CATEGORIES[options.category]) {
                errorLine(`Unknown category: ${options.category}`);
                console.log(chalk.gray('Available: regulation, technology, adoption, events'));
                process.exit(1);
            }
            ideas = getMarketsByCategory(options.category).slice(0, count);
        } else {
            ideas = generateMultipleMarkets(count);
        }

        console.log(chalk.cyan(`\nGenerated ${ideas.length} privacy market ideas:\n`));

        ideas.forEach((idea, i) => {
            const cat = PRIVACY_CATEGORIES[idea.categoryKey];
            const urgencyColor = cat?.urgency === 'breaking' ? chalk.red :
                                 cat?.urgency === 'timely' ? chalk.yellow : chalk.gray;
            const sentimentIcon = cat?.sentiment === 'bullish' ? '↑' :
                                  cat?.sentiment === 'bearish' ? '↓' : '→';

            console.log(chalk.yellow(`${i + 1}.`), idea.question);
            console.log(chalk.gray(`   Category: ${idea.category}`));
            console.log(chalk.gray(`   Duration: ${idea.durationDays || 30} days | `),
                       urgencyColor(`Urgency: ${cat?.urgency || 'evergreen'}`),
                       chalk.gray(` | Sentiment: ${sentimentIcon} ${cat?.sentiment || 'neutral'}`));
            console.log();
        });
    });

program
    .command('categories')
    .description('List available market categories')
    .action(() => {
        const cats = listCategories();

        console.log(chalk.cyan('\nPrivacy Market Categories:\n'));

        cats.forEach(cat => {
            const category = PRIVACY_CATEGORIES[cat.key];
            const percentage = (cat.weight * 100).toFixed(0);
            const urgencyColor = category?.urgency === 'breaking' ? chalk.red :
                                 category?.urgency === 'timely' ? chalk.yellow : chalk.gray;

            console.log(chalk.yellow(cat.name), chalk.gray(`(${percentage}% weight)`));
            console.log(chalk.gray(`  Templates: ${cat.templateCount}`),
                       chalk.gray(' | '),
                       urgencyColor(`Urgency: ${category?.urgency || 'evergreen'}`),
                       chalk.gray(' | '),
                       chalk.gray(`Sentiment: ${category?.sentiment || 'neutral'}`));
            console.log();
        });
    });

program
    .command('list')
    .description('List existing markets')
    .option('-n, --limit <limit>', 'Maximum markets to show', '20')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
        try {
            const agent = new PrivacyOracleAgent({ verbose: options.verbose });
            const limit = parseInt(options.limit, 10);

            const addresses = await withSpinner(
                'Fetching market addresses',
                () => agent.getMarketAddresses(),
                { successText: 'Markets fetched' }
            );

            const showing = addresses.slice(0, limit);
            console.log(chalk.cyan(`\nFound ${addresses.length} markets. Showing first ${showing.length}:\n`));

            for (const addr of showing) {
                try {
                    const info = await agent.fetchMarketInfo(addr);
                    const status = info.resolved ? chalk.green('RESOLVED') :
                                   info.resolvable ? chalk.yellow('ACTIVE') : chalk.red('NOT RESOLVABLE');

                    console.log(chalk.white(info.question));
                    console.log(chalk.gray(`  ${addr}`));
                    console.log(chalk.gray(`  Status: ${status} | Ends: ${info.endTime.toLocaleDateString()}`));
                    console.log();
                } catch (e) {
                    console.log(chalk.gray(`  ${addr} - Error fetching details`));
                }
            }

        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('info <market>')
    .description('Get detailed info about a specific market')
    .option('-v, --verbose', 'Verbose output')
    .action(async (market, options) => {
        try {
            const agent = new PrivacyOracleAgent({ verbose: options.verbose });
            const info = await agent.fetchMarketInfo(market);
            
            console.log(chalk.cyan('\nMarket Information:\n'));
            console.log(chalk.yellow('Question:'), info.question);
            console.log(chalk.yellow('Address:'), info.address);
            console.log(chalk.yellow('Creator:'), info.creator);
            console.log(chalk.yellow('Status:'), info.resolved ? 'Resolved' : (info.resolvable ? 'Active' : 'Not Resolvable'));
            console.log(chalk.yellow('End Time:'), info.endTime.toLocaleString());
            
            if (info.winningToken) {
                console.log(chalk.yellow('Winner:'), info.winningToken);
            }
            
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program
    .command('config')
    .description('Show current configuration')
    .action(() => {
        const config = getConfig();
        const validation = validateConfig(config);

        console.log(chalk.cyan('\nCurrent Configuration:\n'));

        // Network
        console.log(chalk.yellow('Network'));
        infoLine(`Network: ${config.network}`);
        infoLine(`RPC: ${config.heliusKey ? 'Helius (configured)' : chalk.red('Public RPC (rate limited)')}`);
        infoLine(`Wallet: ${config.walletKey ? chalk.green('Configured') : chalk.red('Not configured')}`);
        console.log();

        // Collateral
        console.log(chalk.yellow('Collateral'));
        infoLine(`Token: ${config.collateralToken}`);
        infoLine(`Mint: ${config.collateralMint.toBase58()}`);
        infoLine(`Prefer Confidential: ${config.preferConfidential ? 'Yes' : 'No'}`);
        console.log();

        // Markets
        console.log(chalk.yellow('Market Defaults'));
        infoLine(`Liquidity: ${config.defaultLiquidity.toString()}`);
        infoLine(`Duration: ${config.defaultDurationDays} days`);
        console.log();

        // Daemon
        console.log(chalk.yellow('Daemon Settings'));
        infoLine(`Schedule: ${config.daemon.schedule}`);
        infoLine(`Markets per round: ${config.daemon.marketsPerRound}`);
        infoLine(`Storage: ${config.daemon.storagePath || 'In-memory'}`);
        console.log();

        // Optional features
        console.log(chalk.yellow('Optional Features'));
        infoLine(`News monitoring: ${config.news.enabled ? chalk.green('Enabled') : 'Disabled'}`);
        infoLine(`Webhook server: ${config.webhook.enabled ? chalk.green('Enabled') : 'Disabled'}`);
        console.log();

        // Validation
        if (validation.warnings.length > 0) {
            console.log(chalk.yellow('Warnings:'));
            validation.warnings.forEach(w => console.log(chalk.yellow(`  ! ${w}`)));
        }

        if (!validation.valid) {
            console.log(chalk.red('\nErrors:'));
            validation.errors.forEach(e => errorLine(e));
        }
    });

// Daemon command
program
    .command('daemon')
    .description('Run as autonomous daemon, creating markets on a schedule')
    .option('-s, --schedule <schedule>', 'Cron expression or interval (30m, 1h, 24h)', '1h')
    .option('-n, --iterations <count>', 'Max iterations (infinite if omitted)')
    .option('-c, --count <count>', 'Markets per cycle', '1')
    .option('--dry-run', 'Generate markets without creating on-chain')
    .option('--news', 'Enable news monitoring for timely markets')
    .option('--webhooks', 'Enable webhook server for Helius events')
    .option('--webhook-port <port>', 'Webhook server port', '3000')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
        try {
            const config = getConfig();
            const validation = validateConfig(config);

            if (!validation.valid && !options.dryRun) {
                validation.errors.forEach(e => errorLine(e));
                process.exit(1);
            }

            console.log(chalk.cyan('\n=== Privacy Oracle Daemon ===\n'));

            const daemonConfig = {
                ...config,
                daemon: {
                    ...config.daemon,
                    schedule: options.schedule,
                    marketsPerRound: parseInt(options.count, 10),
                    maxIterations: options.iterations ? parseInt(options.iterations, 10) : undefined
                },
                news: {
                    ...config.news,
                    enabled: options.news || config.news.enabled
                },
                webhook: {
                    ...config.webhook,
                    enabled: options.webhooks || config.webhook.enabled,
                    port: parseInt(options.webhookPort, 10)
                },
                dryRun: options.dryRun,
                verbose: options.verbose
            };

            infoLine(`Schedule: ${daemonConfig.daemon.schedule}`);
            infoLine(`Markets per cycle: ${daemonConfig.daemon.marketsPerRound}`);
            infoLine(`Max iterations: ${daemonConfig.daemon.maxIterations || 'Infinite'}`);
            infoLine(`Dry run: ${daemonConfig.dryRun ? 'Yes' : 'No'}`);
            infoLine(`News monitoring: ${daemonConfig.news.enabled ? 'Enabled' : 'Disabled'}`);
            infoLine(`Webhooks: ${daemonConfig.webhook.enabled ? `Enabled (port ${daemonConfig.webhook.port})` : 'Disabled'}`);
            console.log();

            const daemon = new PrivacyOracleDaemon(daemonConfig);

            await daemon.start();

            console.log(chalk.green('\nDaemon started. Press Ctrl+C to stop.\n'));

        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

// Stats command
program
    .command('stats')
    .description('Show market analytics and statistics')
    .option('--period <period>', 'Time period (24h, 7d, 30d)', '7d')
    .action(async (options) => {
        try {
            const config = getConfig();
            const storagePath = config.daemon.storagePath || ':memory:';

            const store = createMarketStore(storagePath);
            const aggregator = createAggregator(store);

            const overview = await withSpinner(
                'Loading analytics',
                () => aggregator.getOverview(),
                { successText: 'Analytics loaded' }
            );

            console.log(chalk.cyan('\n=== Market Analytics ===\n'));

            // Summary
            console.log(chalk.yellow('Summary'));
            infoLine(`Total markets: ${overview.summary.totalMarkets}`);
            infoLine(`Active: ${overview.summary.activeMarkets}`);
            infoLine(`Resolved: ${overview.summary.resolvedMarkets}`);
            infoLine(`Cancelled: ${overview.summary.cancelledMarkets}`);
            infoLine(`Created this week: ${overview.summary.recentWeek}`);
            console.log();

            // Performance
            console.log(chalk.yellow('Performance'));
            infoLine(`Total volume: ${formatNumber(overview.performance.totalVolume || 0)}`);
            infoLine(`Avg duration: ${formatDuration(overview.performance.averageDuration || 0)}`);
            infoLine(`Resolution rate: ${(overview.performance.resolutionRate * 100 || 0).toFixed(1)}%`);
            console.log();

            // Category breakdown
            if (overview.categoryBreakdown.length > 0) {
                console.log(chalk.yellow('By Category'));
                overview.categoryBreakdown.forEach(cat => {
                    const bar = '█'.repeat(Math.ceil(cat.percentage / 5));
                    console.log(`  ${cat.category}: ${cat.count} (${cat.percentage}%) ${chalk.cyan(bar)}`);
                });
                console.log();
            }

            // Recent markets
            if (overview.recentMarkets.length > 0) {
                console.log(chalk.yellow('Recent Markets'));
                overview.recentMarkets.slice(0, 5).forEach(m => {
                    const statusColor = m.status === 'active' ? chalk.green :
                                       m.status === 'resolved' ? chalk.blue : chalk.gray;
                    console.log(`  ${statusColor('●')} ${m.question.slice(0, 60)}...`);
                });
            }

            store.close();

        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

// Interactive mode
program
    .command('interactive')
    .alias('i')
    .description('Interactive market creation wizard')
    .action(async () => {
        try {
            const config = getConfig();
            const validation = validateConfig(config);

            console.log(chalk.cyan('\n=== Privacy Oracle Interactive Mode ===\n'));

            if (!validation.valid) {
                validation.errors.forEach(e => errorLine(e));
                console.log(chalk.yellow('\nNote: Wallet not configured. Running in preview mode.\n'));
            }

            // Category selection
            const categories = listCategories();
            const { category } = await inquirer.prompt([{
                type: 'list',
                name: 'category',
                message: 'Select market category:',
                choices: [
                    { name: 'Random (AI picks)', value: 'random' },
                    ...categories.map(c => ({
                        name: `${c.name} (${c.templateCount} templates)`,
                        value: c.key
                    }))
                ]
            }]);

            // Generate question
            let market;
            if (category === 'random') {
                market = generatePrivacyMarket();
            } else {
                const categoryMarkets = getMarketsByCategory(category);
                market = categoryMarkets[Math.floor(Math.random() * categoryMarkets.length)];
            }

            console.log(chalk.cyan('\nGenerated question:'));
            console.log(chalk.white(`  "${market.question}"\n`));

            // Customize?
            const { customize } = await inquirer.prompt([{
                type: 'confirm',
                name: 'customize',
                message: 'Customize this question?',
                default: false
            }]);

            let finalQuestion = market.question;
            if (customize) {
                const { customQuestion } = await inquirer.prompt([{
                    type: 'input',
                    name: 'customQuestion',
                    message: 'Enter custom question:',
                    default: market.question
                }]);
                finalQuestion = customQuestion;
            }

            // Duration
            const { duration } = await inquirer.prompt([{
                type: 'list',
                name: 'duration',
                message: 'Market duration:',
                choices: [
                    { name: '14 days', value: 14 },
                    { name: '30 days (recommended)', value: 30 },
                    { name: '60 days', value: 60 },
                    { name: '90 days', value: 90 },
                    { name: 'Custom', value: 'custom' }
                ],
                default: 1
            }]);

            let finalDuration = duration;
            if (duration === 'custom') {
                const { customDuration } = await inquirer.prompt([{
                    type: 'number',
                    name: 'customDuration',
                    message: 'Enter duration in days:',
                    default: 30
                }]);
                finalDuration = customDuration;
            }

            // Liquidity
            const { liquidity } = await inquirer.prompt([{
                type: 'list',
                name: 'liquidity',
                message: 'Initial liquidity:',
                choices: [
                    { name: '500,000 (0.5 USDC)', value: '500000' },
                    { name: '1,000,000 (1 USDC) - recommended', value: '1000000' },
                    { name: '5,000,000 (5 USDC)', value: '5000000' },
                    { name: 'Custom', value: 'custom' }
                ],
                default: 1
            }]);

            let finalLiquidity = liquidity;
            if (liquidity === 'custom') {
                const { customLiquidity } = await inquirer.prompt([{
                    type: 'input',
                    name: 'customLiquidity',
                    message: 'Enter liquidity in base units:',
                    default: '1000000'
                }]);
                finalLiquidity = customLiquidity;
            }

            // Market type
            const { marketType } = await inquirer.prompt([{
                type: 'list',
                name: 'marketType',
                message: 'Market type:',
                choices: [
                    { name: 'AMM (Automated Market Maker) - recommended', value: 'amm' },
                    { name: 'P2P (Peer-to-Peer)', value: 'p2p' }
                ],
                default: 0
            }]);

            // Summary
            console.log(chalk.cyan('\n=== Market Summary ===\n'));
            infoLine(`Question: ${finalQuestion}`);
            infoLine(`Duration: ${finalDuration} days`);
            infoLine(`Liquidity: ${finalLiquidity}`);
            infoLine(`Type: ${marketType.toUpperCase()}`);
            console.log();

            if (!validation.valid) {
                console.log(chalk.yellow('Cannot create market: wallet not configured'));
                console.log(chalk.gray('Set WALLET_PRIVATE_KEY or PRIVATE_KEY in .env'));
                return;
            }

            // Confirm
            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: 'Create this market on Solana?',
                default: true
            }]);

            if (!confirm) {
                console.log(chalk.yellow('Market creation cancelled.'));
                return;
            }

            // Create market
            const agent = new PrivacyOracleAgent({ verbose: true });

            const result = await withSpinner(
                'Creating market on Solana',
                async () => {
                    if (marketType === 'p2p') {
                        return agent.createP2PMarket({
                            question: finalQuestion,
                            durationDays: finalDuration,
                            amount: BigInt(finalLiquidity),
                            side: 'yes'
                        });
                    }
                    return agent.createPrivacyMarket({
                        question: finalQuestion,
                        durationDays: finalDuration,
                        liquidity: BigInt(finalLiquidity)
                    });
                },
                { successText: 'Market created!' }
            );

            console.log();
            successLine('Market created successfully!');
            infoLine(`Address: ${result.market}`);
            infoLine(`Signature: ${result.signature}`);

        } catch (error) {
            if (error.name === 'ExitPromptError') {
                console.log(chalk.yellow('\nCancelled.'));
                return;
            }
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

// Tokens command
program
    .command('tokens')
    .description('List supported collateral tokens')
    .option('--check <mint>', 'Check if a mint supports confidential transfers')
    .action(async (options) => {
        try {
            const config = getConfig();

            if (options.check) {
                console.log(chalk.cyan('\nChecking mint for confidential transfer support...\n'));

                const connection = new Connection(config.rpcUrl);
                const result = await withSpinner(
                    'Checking mint',
                    () => checkConfidentialTransferSupport(connection, options.check),
                    { successText: 'Check complete' }
                );

                console.log();
                infoLine(`Mint: ${options.check}`);
                infoLine(`Token-2022: ${result.isToken2022 ? chalk.green('Yes') : 'No'}`);
                infoLine(`Confidential transfers: ${result.supported ? chalk.green('Supported') : chalk.yellow('Not supported')}`);
                infoLine(`Details: ${result.reason}`);
                return;
            }

            console.log(chalk.cyan('\nSupported Collateral Tokens:\n'));

            const networks = ['mainnet', 'devnet'];

            for (const network of networks) {
                console.log(chalk.yellow(`${network.charAt(0).toUpperCase() + network.slice(1)}:`));
                const tokens = listSupportedTokens(network);

                tokens.forEach(token => {
                    console.log(`  ${chalk.white(token.symbol)}`);
                    console.log(chalk.gray(`    ${token.address}`));
                });
                console.log();
            }

            console.log(chalk.gray('Tip: Use a Token-2022 mint with confidential transfer extension'));
            console.log(chalk.gray('     for privacy-focused collateral.'));
            console.log(chalk.gray('     Set COLLATERAL_TOKEN in .env to use a custom mint.'));

        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
    });

program.parse();
