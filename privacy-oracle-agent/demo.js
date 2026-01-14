#!/usr/bin/env node

// Privacy Oracle Agent - Terminal Demo
// oldschool hacker aesthetic

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bright = (s) => `\x1b[97m${s}\x1b[0m`;

async function type(text, delay = 20) {
    for (const char of text) {
        process.stdout.write(char);
        await sleep(delay);
    }
}

async function typeLine(text, delay = 20) {
    await type(text, delay);
    console.log();
}

async function scramble(text, iterations = 5) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    for (let i = 0; i < iterations; i++) {
        let out = '';
        for (let j = 0; j < text.length; j++) {
            if (text[j] === ' ') {
                out += ' ';
            } else if (Math.random() > 0.3 + (i * 0.15)) {
                out += chars[Math.floor(Math.random() * chars.length)];
            } else {
                out += text[j];
            }
        }
        process.stdout.write('\r' + out);
        await sleep(60);
    }
    process.stdout.write('\r' + text + '\n');
}

async function loader(label, duration = 1500) {
    const frames = ['|', '/', '-', '\\'];
    const end = Date.now() + duration;
    let i = 0;
    while (Date.now() < end) {
        process.stdout.write(`\r[${frames[i % 4]}] ${label}`);
        await sleep(80);
        i++;
    }
    process.stdout.write(`\r[*] ${label}\n`);
}

async function dots(count = 30, delay = 40) {
    for (let i = 0; i < count; i++) {
        process.stdout.write('.');
        await sleep(delay);
    }
    console.log();
}

async function main() {
    console.clear();
    console.log();

    // header
    console.log(dim('--------------------------------------------------------------------------------'));
    console.log();
    console.log('  PRIVACY ORACLE AGENT v1.1.0');
    console.log(dim('  autonomous prediction market daemon'));
    console.log();
    console.log(dim('--------------------------------------------------------------------------------'));
    console.log();
    await sleep(1000);

    // boot
    await typeLine('> initializing daemon', 25);
    await sleep(300);

    console.log();
    console.log(dim('  loading modules'));
    console.log();

    const modules = [
        'solana/web3       ',
        'pnp-sdk           ',
        'helius-client     ',
        'market-generator  ',
        'daemon/scheduler  ',
        'news-monitor      ',
        'market-store      ',
        'analytics         ',
        'webhook-server    '
    ];

    for (const mod of modules) {
        process.stdout.write(dim('    '));
        await type(mod, 15);
        await sleep(150);
        console.log('[ok]');
        await sleep(80);
    }

    console.log();
    await sleep(500);

    // connection
    await scramble('> establishing helius connection');
    await sleep(200);

    console.log();
    console.log(dim('  endpoint:  ') + 'helius-rpc.com');
    console.log(dim('  network:   ') + 'mainnet-beta');
    console.log(dim('  latency:   ') + '12ms');
    console.log(dim('  webhooks:  ') + 'enabled:3000');
    console.log(dim('  status:    ') + 'connected');
    console.log();
    await sleep(800);

    // wallet
    await typeLine('> loading wallet', 25);
    await sleep(300);
    console.log();
    console.log(dim('  address:   ') + '7xKXw...9fZq');
    console.log(dim('  balance:   ') + '142.847 SOL');
    console.log(dim('  usdc:      ') + '2500.00');
    console.log(dim('  collateral:') + ' Token-2022 confidential');
    console.log();
    await sleep(800);

    // restore state
    await typeLine('> restoring daemon state', 25);
    console.log();
    console.log(dim('  storage:   ') + './data/markets.db');
    console.log(dim('  markets:   ') + '47 tracked');
    console.log(dim('  last run:  ') + '2h 14m ago');
    console.log(dim('  schedule:  ') + '1h interval');
    console.log();
    await sleep(800);

    // news monitoring
    await scramble('> scanning news feeds');
    console.log();

    const feeds = [
        'eff.org/rss       ',
        'decrypt.co        ',
        'coindesk.com      ',
        'theblock.co       '
    ];

    for (const feed of feeds) {
        process.stdout.write(dim('    '));
        await type(feed, 12);
        await sleep(200);
        const items = Math.floor(Math.random() * 12) + 3;
        console.log(`[${items} items]`);
        await sleep(80);
    }

    console.log();
    await sleep(500);

    // scoring
    await typeLine('> scoring relevance', 25);
    console.log();

    const scans = [
        'regulatory frameworks',
        'zk protocol activity',
        'privacy token flows',
        'encryption standards',
        'breach incidents',
        'policy changes'
    ];

    for (const scan of scans) {
        process.stdout.write(dim('    '));
        await type(scan, 12);
        await sleep(200);
        const score = Math.floor(Math.random() * 40) + 20;
        console.log(dim(' .......... ') + `score:${score}`);
        await sleep(80);
    }

    console.log();
    await sleep(500);

    // processing
    await typeLine('> processing on-chain data', 25);
    console.log();

    for (let i = 0; i < 6; i++) {
        const hash = [...Array(64)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
        console.log(dim('    ') + hash);
        await sleep(100);
    }

    console.log();
    await sleep(500);

    // generating
    await scramble('> generating prediction markets');
    console.log();

    await loader('analyzing trends', 1200);
    await loader('building questions', 1000);
    await loader('validating params', 800);
    await loader('checking collateral', 600);

    console.log();
    await sleep(500);

    // markets
    await typeLine('> markets ready for deployment', 25);
    console.log();
    console.log(dim('--------------------------------------------------------------------------------'));
    console.log();

    const markets = [
        {
            q: 'Will GDPR fines exceed $5B in 2026?',
            cat: 'regulation',
            urg: 'timely',
            days: 180,
            liq: 1000
        },
        {
            q: 'Will Tornado Cash sanctions be lifted by Q3 2026?',
            cat: 'technology',
            urg: 'evergreen',
            days: 240,
            liq: 2500
        },
        {
            q: 'Will Light Protocol TVL exceed $100M by June 2026?',
            cat: 'technology',
            urg: 'timely',
            days: 150,
            liq: 5000
        }
    ];

    for (let i = 0; i < markets.length; i++) {
        const m = markets[i];
        console.log(dim(`  [${i + 1}]`));
        console.log(`  ${m.q}`);
        console.log(dim(`      category: ${m.cat} | urgency: ${m.urg} | ${m.days}d | ${m.liq} usdc`));
        console.log();
        await sleep(400);
    }

    console.log(dim('--------------------------------------------------------------------------------'));
    console.log();
    await sleep(500);

    // deploy
    await typeLine('> deploying to solana', 25);
    console.log();

    for (let i = 0; i < 3; i++) {
        const sig = [...Array(88)].map(() => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 58)]).join('');
        process.stdout.write(dim(`  [${i + 1}/3] `));
        await type('submitting tx', 15);
        process.stdout.write(' ');
        await dots(12, 60);
        console.log(dim('       sig: ') + sig.slice(0, 43) + '...');
        console.log();
        await sleep(300);
    }

    await sleep(500);

    // save state
    await typeLine('> persisting state', 25);
    console.log();
    console.log(dim('  storage:   ') + './data/markets.db');
    console.log(dim('  markets:   ') + '50 tracked');
    console.log(dim('  events:    ') + '3 logged');
    console.log();
    await sleep(500);

    // stats
    await scramble('> aggregating analytics');
    console.log();
    console.log(dim('--------------------------------------------------------------------------------'));
    console.log();
    console.log('  daemon statistics');
    console.log();
    console.log(dim('  total markets:      ') + '50');
    console.log(dim('  active:             ') + '38');
    console.log(dim('  resolved:           ') + '12');
    console.log(dim('  resolution rate:    ') + '92%');
    console.log();
    console.log(dim('  by category:'));
    console.log(dim('    regulation        ') + '12 (24%)  ' + dim('████'));
    console.log(dim('    technology        ') + '18 (36%)  ' + dim('███████'));
    console.log(dim('    adoption          ') + '11 (22%)  ' + dim('████'));
    console.log(dim('    events            ') + '9  (18%)  ' + dim('███'));
    console.log();
    console.log(dim('--------------------------------------------------------------------------------'));
    console.log();
    await sleep(800);

    // summary
    console.log('  cycle complete');
    console.log();
    console.log(dim('  markets created:    ') + '3');
    console.log(dim('  total liquidity:    ') + '8500 usdc');
    console.log(dim('  helius calls:       ') + '47');
    console.log(dim('  avg latency:        ') + '12ms');
    console.log(dim('  next run:           ') + '58m 42s');
    console.log();
    console.log(dim('--------------------------------------------------------------------------------'));
    console.log();

    await typeLine('> daemon standing by', 30);
    console.log();

    // footer
    console.log(dim('  solana privacy hackathon 2026'));
    console.log(dim('  powered by helius + pnp exchange'));
    console.log();
}

main().catch(console.error);
