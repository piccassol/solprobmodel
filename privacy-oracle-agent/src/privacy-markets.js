// Privacy-themed prediction market templates and AI generation logic

const PRIVACY_CATEGORIES = {
    regulation: {
        name: 'Privacy Regulation',
        weight: 0.25,
        urgency: 'timely',
        sentiment: 'neutral',
        templates: [
            'Will {country} pass comprehensive privacy legislation by {date}?',
            'Will GDPR fines exceed ${amount}B in {year}?',
            'Will the US pass a federal privacy law by end of {year}?',
            'Will {company} face privacy-related regulatory action by {date}?',
            'Will any G7 nation ban end-to-end encryption by {date}?',
            'Will the SEC take enforcement action against a privacy protocol by {date}?',
            'Will OFAC add new privacy protocols to sanctions list by {date}?',
            'Will {country} implement mandatory KYC for self-custody wallets by {date}?',
            'Will the Tornado Cash developer case result in acquittal by {date}?',
            'Will any country legalize privacy-preserving payments by {date}?'
        ]
    },
    technology: {
        name: 'Privacy Technology',
        weight: 0.30,
        urgency: 'evergreen',
        sentiment: 'bullish',
        templates: [
            'Will zkSync TVL exceed ${amount}B by {date}?',
            'Will Tornado Cash sanctions be lifted by {date}?',
            'Will a major wallet integrate confidential transactions by {date}?',
            'Will homomorphic encryption see mainstream blockchain adoption by {year}?',
            'Will Solana native ZK proofs go live on mainnet by {date}?',
            'Will any privacy coin enter top 10 market cap by {date}?',
            'Will Light Protocol TVL exceed ${amount}M by {date}?',
            'Will Solana Token-2022 confidential transfers see significant adoption by {date}?',
            'Will a ZK-rollup process over 1000 TPS on mainnet by {date}?',
            'Will Aztec Network launch on mainnet by {date}?',
            'Will any major DEX implement private swaps by {date}?',
            'Will RAILGUN protocol TVL exceed ${amount}M by {date}?',
            'Will Zcash implement a major protocol upgrade by {date}?',
            'Will any L2 implement native confidential transactions by {date}?',
            'Will a privacy-focused stablecoin reach ${amount}M market cap by {date}?'
        ]
    },
    adoption: {
        name: 'Privacy Adoption',
        weight: 0.25,
        urgency: 'timely',
        sentiment: 'bullish',
        templates: [
            'Will Signal exceed {amount}M monthly active users by {date}?',
            'Will a major exchange delist all privacy coins by {date}?',
            'Will privacy-preserving identity solutions see enterprise adoption by {year}?',
            'Will any Fortune 500 company adopt ZK proofs for supply chain by {date}?',
            'Will confidential transactions become default on any top 20 chain by {date}?',
            'Will Brave browser exceed {amount}M monthly active users by {date}?',
            'Will ProtonMail reach {amount}M paid subscribers by {date}?',
            'Will any major social platform add E2E encryption for DMs by {date}?',
            'Will hardware wallets with privacy features exceed {amount}M units sold by {date}?',
            'Will a privacy-focused search engine enter top 5 globally by {date}?'
        ]
    },
    events: {
        name: 'Privacy Events',
        weight: 0.20,
        urgency: 'breaking',
        sentiment: 'neutral',
        templates: [
            'Will there be a major data breach affecting 100M+ users by {date}?',
            'Will any government agency be caught using unauthorized surveillance by {date}?',
            'Will a privacy-focused project win a major hackathon prize by {date}?',
            'Will Vitalik publicly endorse a specific privacy solution by {date}?',
            'Will the Solana Privacy Hackathon see over {amount} submissions?',
            'Will a major privacy researcher receive significant recognition by {date}?',
            'Will any privacy protocol suffer a major exploit by {date}?',
            'Will a whistleblower reveal new government surveillance programs by {date}?',
            'Will any major tech CEO publicly advocate for privacy by {date}?',
            'Will a privacy-themed movie or documentary reach mainstream audiences by {date}?'
        ]
    }
};

const FILL_DATA = {
    countries: ['USA', 'EU', 'UK', 'Japan', 'South Korea', 'Australia', 'Canada', 'Brazil'],
    companies: ['Meta', 'Google', 'Apple', 'Microsoft', 'Amazon', 'ByteDance', 'OpenAI', 'Coinbase'],
    amounts: ['1', '5', '10', '50', '100', '500'],
    smallAmounts: ['10', '25', '50', '100', '250']
};

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDate(minDays = 14, maxDays = 180) {
    const days = minDays + Math.floor(Math.random() * (maxDays - minDays));
    const date = new Date();
    date.setDate(date.getDate() + days);
    
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getEndOfYear() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const nextYear = now.getMonth() > 9 ? currentYear + 1 : currentYear;
    return nextYear.toString();
}

function fillTemplate(template) {
    let filled = template;
    
    filled = filled.replace('{country}', getRandomElement(FILL_DATA.countries));
    filled = filled.replace('{company}', getRandomElement(FILL_DATA.companies));
    filled = filled.replace('{amount}', getRandomElement(FILL_DATA.amounts));
    filled = filled.replace('{date}', getRandomDate());
    filled = filled.replace('{year}', getEndOfYear());
    
    if (filled.includes('{amount}')) {
        filled = filled.replace('{amount}', getRandomElement(FILL_DATA.smallAmounts));
    }
    
    return filled;
}

function selectCategory() {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [key, category] of Object.entries(PRIVACY_CATEGORIES)) {
        cumulative += category.weight;
        if (rand < cumulative) {
            return { key, category };
        }
    }
    
    return { key: 'technology', category: PRIVACY_CATEGORIES.technology };
}

export function generatePrivacyMarket() {
    const { key, category } = selectCategory();
    const template = getRandomElement(category.templates);
    const question = fillTemplate(template);
    
    const durationDays = 14 + Math.floor(Math.random() * 166);
    
    return {
        question,
        category: category.name,
        categoryKey: key,
        durationDays,
        suggestedLiquidity: key === 'events' ? 500000n : 1000000n
    };
}

export function generateMultipleMarkets(count = 5) {
    const markets = [];
    const usedQuestions = new Set();
    
    while (markets.length < count) {
        const market = generatePrivacyMarket();
        if (!usedQuestions.has(market.question)) {
            usedQuestions.add(market.question);
            markets.push(market);
        }
    }
    
    return markets;
}

export function getMarketsByCategory(categoryKey) {
    const category = PRIVACY_CATEGORIES[categoryKey];
    if (!category) {
        throw new Error(`Unknown category: ${categoryKey}`);
    }
    
    return category.templates.map(template => ({
        question: fillTemplate(template),
        category: category.name,
        categoryKey
    }));
}

export function listCategories() {
    return Object.entries(PRIVACY_CATEGORIES).map(([key, cat]) => ({
        key,
        name: cat.name,
        weight: cat.weight,
        templateCount: cat.templates.length
    }));
}

export { PRIVACY_CATEGORIES };
