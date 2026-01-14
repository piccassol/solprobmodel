// Relevance scoring algorithm for privacy news
// Determines how relevant a news item is for market generation

// Core privacy-related keywords with weights
export const PRIVACY_KEYWORDS = {
    // High relevance - direct privacy tech
    'zero-knowledge': 3,
    'zk-proof': 3,
    'zk-snark': 3,
    'zk-stark': 3,
    'zkrollup': 3,
    'confidential': 2.5,
    'encryption': 2.5,
    'encrypted': 2.5,
    'privacy-preserving': 3,
    'private transaction': 3,

    // Privacy protocols
    'tornado cash': 3,
    'zcash': 2.5,
    'monero': 2.5,
    'light protocol': 3,
    'elusiv': 3,
    'aztec': 2.5,
    'railgun': 2.5,
    'secret network': 2.5,

    // Regulatory
    'gdpr': 2,
    'privacy law': 2.5,
    'data protection': 2,
    'surveillance': 2.5,
    'sanctions': 2,
    'ofac': 2.5,
    'compliance': 1.5,
    'kyc': 1.5,
    'aml': 1.5,

    // General privacy
    'privacy': 1.5,
    'anonymous': 2,
    'anonymity': 2,
    'pseudonymous': 1.5,
    'private': 1,
    'mixer': 2,
    'mixing': 2,
    'shielded': 2.5,

    // Tech terms
    'homomorphic': 3,
    'mpc': 2.5,
    'secure enclave': 2,
    'tee': 2,
    'trusted execution': 2,

    // Events
    'data breach': 2.5,
    'leak': 1.5,
    'hack': 1.5,
    'compromised': 1.5,

    // Solana specific
    'solana privacy': 3,
    'spl confidential': 3,
    'token-2022 confidential': 3
};

// Category mappings
const CATEGORY_KEYWORDS = {
    regulation: ['law', 'regulation', 'gdpr', 'sanctions', 'ofac', 'compliance', 'legislation', 'ban', 'restrict'],
    technology: ['zk', 'protocol', 'launch', 'release', 'upgrade', 'mainnet', 'testnet', 'tvl', 'smart contract'],
    adoption: ['users', 'growth', 'adoption', 'enterprise', 'mainstream', 'wallet', 'integration'],
    events: ['breach', 'hack', 'leak', 'scandal', 'arrest', 'raid', 'lawsuit', 'verdict']
};

// Urgency indicators
const URGENCY_KEYWORDS = {
    breaking: ['breaking', 'just in', 'urgent', 'alert', 'confirmed', 'arrested', 'breached'],
    timely: ['announces', 'launches', 'releases', 'proposes', 'reaches', 'exceeds', 'surpasses']
};

export function scoreRelevance(text, sourceKeywords = [], sourceWeight = 1.0) {
    const lowerText = text.toLowerCase();
    let score = 0;
    const matchedKeywords = [];

    // Score based on privacy keywords
    for (const [keyword, weight] of Object.entries(PRIVACY_KEYWORDS)) {
        if (lowerText.includes(keyword)) {
            score += weight * 10;
            matchedKeywords.push(keyword);
        }
    }

    // Additional score from source-specific keywords
    for (const keyword of sourceKeywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
            score += 5;
            if (!matchedKeywords.includes(keyword)) {
                matchedKeywords.push(keyword);
            }
        }
    }

    // Apply source weight
    score = Math.round(score * sourceWeight);

    // Cap at 100
    score = Math.min(score, 100);

    // Determine suggested category
    const suggestedCategory = determineCategory(lowerText);

    // Determine urgency
    const urgency = determineUrgency(lowerText);

    return {
        score,
        matchedKeywords,
        suggestedCategory,
        urgency
    };
}

function determineCategory(text) {
    const scores = {
        regulation: 0,
        technology: 0,
        adoption: 0,
        events: 0
    };

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                scores[category] += 1;
            }
        }
    }

    // Find highest scoring category
    let maxScore = 0;
    let bestCategory = 'technology'; // default

    for (const [category, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestCategory = category;
        }
    }

    return bestCategory;
}

function determineUrgency(text) {
    for (const keyword of URGENCY_KEYWORDS.breaking) {
        if (text.includes(keyword)) {
            return 'breaking';
        }
    }

    for (const keyword of URGENCY_KEYWORDS.timely) {
        if (text.includes(keyword)) {
            return 'timely';
        }
    }

    return 'evergreen';
}

// Generate a market question from a news event
export function generateMarketFromNews(newsEvent) {
    const { title, suggestedCategory, urgency } = newsEvent;

    // Extract key entities from title
    const entities = extractEntities(title);

    // Generate appropriate duration based on urgency
    const durationDays = urgency === 'breaking' ? 14 :
                         urgency === 'timely' ? 30 : 90;

    // Generate question based on category
    let question;

    switch (suggestedCategory) {
        case 'regulation':
            question = `Will regulatory action be taken regarding "${entities.topic || 'this development'}" within ${durationDays} days?`;
            break;
        case 'technology':
            question = `Will the technology mentioned in "${entities.topic || 'this news'}" see significant adoption by ${formatFutureDate(durationDays)}?`;
            break;
        case 'adoption':
            question = `Will user adoption metrics exceed expectations for "${entities.topic || 'this platform'}" by ${formatFutureDate(durationDays)}?`;
            break;
        case 'events':
            question = `Will there be follow-up developments on "${entities.topic || 'this event'}" within ${durationDays} days?`;
            break;
        default:
            question = `Will "${entities.topic || 'this development'}" have significant impact by ${formatFutureDate(durationDays)}?`;
    }

    return {
        question,
        category: suggestedCategory,
        durationDays,
        urgency,
        sourceEvent: newsEvent
    };
}

function extractEntities(title) {
    // Simple entity extraction - could be enhanced with NLP
    const words = title.split(' ');

    // Look for capitalized words as potential entities
    const entities = words.filter(w =>
        w.length > 2 &&
        w[0] === w[0].toUpperCase() &&
        !['The', 'And', 'For', 'New', 'With'].includes(w)
    );

    return {
        topic: title.slice(0, 50),
        entities
    };
}

function formatFutureDate(daysFromNow) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}
