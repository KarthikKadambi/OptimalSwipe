export const cardPresets = [
    {
        id: "amex-gold",
        name: "Amex Gold",
        issuer: "American Express",
        color: "#d4af37",
        rewards: [
            { rate: 4.0, category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 4.0, category: "Groceries", method: "any", capPeriod: "annual", spendingCap: 25000, combinedCap: false },
            { rate: 3.0, category: "Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "4x on Dining/Groceries, 3x on Travel, $120 Dining Credit, $120 Uber Cash annually."
    },
    {
        id: "chase-sapphire-reserve",
        name: "Chase Sapphire Reserve",
        issuer: "Chase",
        color: "#1e3a8a",
        rewards: [
            { rate: 3.0, category: "Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 3.0, category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "3x on Travel/Dining, $300 Travel Credit, Priority Pass, No FTF."
    },
    {
        id: "apple-card",
        name: "Apple Card",
        issuer: "Goldman Sachs",
        color: "#f5f5f7",
        rewards: [
            { rate: 3.0, category: "Apple", merchants: "Apple, Uber, T-Mobile, Nike", method: "apple-pay", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 2.0, category: "Everything", categoryMatch: "all", method: "apple-pay", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, category: "Physical Card", categoryMatch: "all", method: "other", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "Daily Cash feature, No fees, Integrated with Apple Wallet."
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
        id: "bilt-mastercard",
        name: "Bilt Mastercard",
        issuer: "Wells Fargo",
        color: "#000000",
        rewards: [
            { rate: 3.0, category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 2.0, category: "Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.0, category: "Rent", method: "any", capPeriod: "annual", spendingCap: 100000, combinedCap: false }
        ],
        perks: "Earn points on rent without fees, Double points on 1st of month."
    },
    {
        id: "chase-freedom-unlimited",
        name: "Chase Freedom Unlimited",
        issuer: "Chase",
        color: "#2563eb",
        rewards: [
            { rate: 5.0, category: "Travel", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 3.0, category: "Dining", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 3.0, category: "Drugstores", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 1.5, category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "1.5% minimum on all purchases, no annual fee."
    },
    {
        id: "capital-one-venture-x",
        name: "Capital One Venture X",
        issuer: "Capital One",
        color: "#023e8a",
        rewards: [
            { rate: 10.0, category: "Hotels & Rentals", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 5.0, category: "Flights", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false },
            { rate: 2.0, category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "$300 Travel Credit, 10k Bonus Miles, Lounge Access."
    },
    {
        id: "bofa-customized-cash",
        name: "BofA Customized Cash",
        issuer: "Bank of America",
        color: "#dc2626",
        rewards: [
            {
                rate: 3.0,
                category: "Category of Choice",
                choices: ["Dining", "Online Shopping", "Travel", "Gas", "Drug Stores", "Home Improvement"],
                method: "any",
                capPeriod: "quarterly",
                spendingCap: 2500,
                combinedCap: true
            },
            { rate: 2.0, category: "Groceries", method: "any", capPeriod: "quarterly", spendingCap: 2500, combinedCap: true },
            { rate: 1.0, category: "All Other", categoryMatch: "all", method: "any", capPeriod: "none", spendingCap: 0, combinedCap: false }
        ],
        perks: "3% in the category of your choice, no annual fee."
    }
];
