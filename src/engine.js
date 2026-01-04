import { storage } from './storage';

// Recommendation Engine Logic
export async function getRecommendation(cards, payments, purchaseDetails) {
    const { category, amount, paymentMethod, merchant, context } = purchaseDetails;

    if (cards.length === 0) {
        return { error: 'Please add some credit cards first to get recommendations.' };
    }

    // Smart fallback logic that considers payment method compatibility
    const eligibleOptions = [];

    cards.forEach(card => {
        if (!card.rewards || card.rewards.length === 0) return;

        card.rewards.forEach(reward => {
            // Check payment method compatibility
            const methodCompatible = reward.method === 'any' ||
                reward.method === paymentMethod ||
                paymentMethod === 'any';

            if (!methodCompatible) return; // Skip incompatible payment methods

            // Check merchant match
            const merchantMatch = !merchant || !reward.merchants ||
                reward.merchants.toLowerCase().includes(merchant.toLowerCase()) ||
                merchant.toLowerCase().includes(reward.merchants.toLowerCase());

            // Check category match
            const categoryMatch = reward.category.toLowerCase().includes(category.toLowerCase()) ||
                category.toLowerCase().includes(reward.category.toLowerCase());

            // Check portal match
            const portalMatch = !reward.portal || reward.portal === purchaseDetails.portal;

            if ((categoryMatch || merchantMatch || reward.category.toLowerCase().includes('all')) && portalMatch) {
                // Check if cap is available
                const multiplier = card.rewardMultiplier || 1.0;
                let effectiveRate = reward.rate * multiplier;

                // Handle Bilt Rent Day (Double Points on 1st of month, except Rent)
                const isFirstOfMonth = new Date().getDate() === 1;
                if (isFirstOfMonth && card.rentDayBoost && reward.category.toLowerCase() !== 'rent') {
                    effectiveRate *= 2;
                }

                let capStatus = 'unlimited';

                if (reward.spendingCap) {
                    const spent = reward.combinedCap ?
                        getSpendingByCardAndPeriod(payments, card.id, reward.capPeriod, true) :
                        getSpendingByCardAndPeriod(payments, card.id, reward.capPeriod);
                    const remaining = reward.spendingCap - spent;

                    if (remaining <= 0) {
                        return; // Skip - cap exhausted
                    } else if (remaining < amount) {
                        const fallbackReward = card.rewards.find(r => r.category.toLowerCase().includes('all'));
                        const fallbackRate = (fallbackReward ? fallbackReward.rate : 1) * multiplier;

                        const highRateEarnings = remaining * (reward.rate * multiplier / 100);
                        const lowRateEarnings = (amount - remaining) * (fallbackRate / 100);
                        effectiveRate = ((highRateEarnings + lowRateEarnings) / amount) * 100;
                        capStatus = `$${remaining.toFixed(2)} remaining`;
                    } else {
                        capStatus = `$${remaining.toFixed(2)} remaining`;
                    }
                }

                const cashbackValue = amount * (effectiveRate / 100);

                eligibleOptions.push({
                    card: card,
                    reward: reward,
                    effectiveRate: effectiveRate,
                    cashbackValue: cashbackValue,
                    capStatus: capStatus,
                    categoryMatch: categoryMatch,
                    merchantMatch: merchantMatch,
                    portalMatch: portalMatch,
                    unit: reward.unit || 'cashback'
                });
            }
        });
    });

    // Sort by cashback value (highest first)
    eligibleOptions.sort((a, b) => b.cashbackValue - a.cashbackValue);

    return eligibleOptions;
}

function getSpendingByCardAndPeriod(payments, cardId, capPeriod, combinedCap = false) {
    const now = new Date();
    let startDate;

    switch (capPeriod) {
        case 'quarterly':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            break;
        case 'annual':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'statement':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        default:
            return 0;
    }

    return payments
        .filter(p => p.cardId === cardId && new Date(p.date) >= startDate)
        .reduce((sum, p) => sum + p.amount, 0);
}
