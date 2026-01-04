/**
 * OptimalSwipe Card Presets
 * Schema Documentation: see src/PRESETS_GUIDE.md
 */
export const cardPresets = [
    {
        id: "bofa-customized-cash",
        name: "BofA Customized Cash Rewards",
        issuer: "Bank of America",
        color: "#dc2626",
        rewards: [
            {
                rate: 3.0,
                unit: "cashback",
                category: "Category of Choice",
                choices: ["Dining", "Online Shopping", "Travel", "Gas & EV", "Drug Stores", "Home Improvement"],
                method: "any",
                capPeriod: "quarterly",
                spendingCap: 2500,
                combinedCap: true
            },
            { rate: 2.0, unit: "cashback", category: "Grocery stores & Wholesale clubs", method: "any", capPeriod: "quarterly", spendingCap: 2500, combinedCap: true },
            { rate: 1.0, unit: "cashback", category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "3% in the category of your choice, no annual fee."
    },
    {
        id: "apple-card",
        name: "Apple Card",
        issuer: "Goldman Sachs",
        color: "#f5f5f7",
        rewards: [
            {
                rate: 3.0,
                unit: "cashback",
                category: "Selected merchants",
                merchants: "Apple, Ace hardware, Booking.com, Chargepoint, Exxon and mobil, Hertz, Nike, Uber, Uber eats, Uber one, Walgreens",
                method: "apple-pay",
                capPeriod: "none",
                spendingCap: 0,
                combinedCap: false
            },
            {
                rate: 2.0,
                unit: "cashback",
                category: "Everything",
                categoryMatch: "all",
                method: "apple-pay",
                capPeriod: "none",
                spendingCap: 0,
                combinedCap: false
            },
            { rate: 1.0, unit: "cashback", category: "Physical Card", categoryMatch: "all", method: "physical-card", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "Daily Cash feature, No fees, Integrated with Apple Wallet."
    },
    {
        id: "capital-one-venture-x",
        name: "Capital One Venture X",
        issuer: "Capital One",
        color: "#023e8a",
        rewards: [
            { rate: 10.0, unit: "miles", category: "Hotels & Rentals", portal: "Capital One Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 5.0, unit: "miles", category: "Flights", portal: "Capital One Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 2.0, unit: "miles", category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "$300 Travel Credit, 10k Bonus Miles, Lounge Access only for cardholder."
    },
    {
        id: "bilt-mastercard",
        name: "Bilt Mastercard",
        issuer: "Wells Fargo",
        color: "#000000",
        rentDayBoost: true,
        rewards: [
            { rate: 3.0, unit: "points", category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 2.0, unit: "points", category: "Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, unit: "points", category: "Rent", method: "any", capPeriod: "annual", spendingCap: 100000, combinedCap: false }
        ],
        perks: "Earn points on rent without fees, Double points on 1st of month."
    },
    {
        id: "amex-gold",
        name: "Amex Gold",
        issuer: "American Express",
        color: "#d4af37",
        rewards: [
            { rate: 4.0, unit: "points", category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 4.0, unit: "points", category: "Groceries", method: "any", capPeriod: "annual", spendingCap: 25000, combinedCap: false },
            { rate: 3.0, unit: "points", category: "Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, unit: "points", category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "4x on Dining/Groceries, 3x on Travel, $120 Dining Credit, $120 Uber Cash annually."
    },
    {
        id: "chase-sapphire-reserve",
        name: "Chase Sapphire Reserve",
        issuer: "Chase",
        color: "#1e3a8a",
        rewards: [
            { rate: 3.0, unit: "points", category: "Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 3.0, unit: "points", category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, unit: "points", category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "3x on Travel/Dining, $300 Travel Credit, Priority Pass, No FTF."
    },
    {
        id: "blue-cash-preferred",
        name: "Blue Cash Preferred",
        issuer: "American Express",
        color: "#3b82f6",
        rewards: [
            { rate: 6.0, category: "Groceries", method: "any", capPeriod: "annual", spendingCap: 6000, combinedCap: false },
            { rate: 6.0, category: "Streaming", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 3.0, category: "Gas", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "6% back on Groceries/Streaming, 3% on Gas/Transit."
    },
    {
        id: "chase-freedom-unlimited",
        name: "Chase Freedom Unlimited",
        issuer: "Chase",
        color: "#2563eb",
        rewards: [
            { rate: 5.0, unit: "points", category: "Travel", portal: "Chase Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 3.0, unit: "points", category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 3.0, unit: "points", category: "Drugstores", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.5, unit: "points", category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "1.5% minimum on all purchases, no annual fee."
    },
];
