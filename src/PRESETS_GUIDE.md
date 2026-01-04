# OptimalSwipe Presets Schema Guide

This document explains the keys used in `src/presets.js` to define card rewards and metadata.

## Top-Level Keys

| Key | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier (e.g., "amex-gold"). |
| `name` | `string` | The display name of the credit card. |
| `issuer` | `string` | The financial institution (e.g., "Chase"). |
| `color` | `string` | Hex code or CSS color for the card UI. |
| `rewards` | `Array` | List of reward tier objects (see below). |
| `perks` | `string` | Summary of additional card benefits. |
| `rentDayBoost` | `boolean` | Optional. If `true`, earning rates double on the 1st of the month (except for "Rent"). |

---

## Reward Object Keys

Each object in the `rewards` array represents a specific earning rule.

| Key | Type | Possible Values / Description |
| :--- | :--- | :--- |
| `rate` | `number` | The earning rate (e.g., `3.0` for 3% or 3x). |
| `unit` | `string` | Optional. Reward currency: `cashback`, `points`, `miles`. |
| `portal` | `string` | Optional. Required booking portal (e.g., "Capital One Travel"). |
| `category` | `string` | Name of the spending category (e.g., "Dining"). |
| `choices` | `string[]` | Optional. Array of categories the user can choose from (e.g., `["Dining", "Travel"]`). |
| `method` | `string` | `any` (default), `apple-pay` (Apple Wallet / Contactless), or `physical-card` (Manual entry / Plastic). |
| `capPeriod` | `string` | `none`, `monthly`, `quarterly`, or `annual`. |
| `spendingCap` | `number` | The max spend allowed at the high rate (e.g., `2500`). Use `0` for no cap. |
| `combinedCap` | `boolean` | `true` if this cap is shared across multiple reward tiers (like BofA). |
| `categoryMatch` | `string` | Optional. Set to `all` to act as the "catch-all" or "Everything" category. |
| `merchants` | `string` | Optional. Comma-separated list of specific stores (e.g., "Apple, Uber, Nike"). |

---

## Engine Behavior Notes

1. **Multiplier Support**: While not in the base preset, the engine supports a `rewardMultiplier` (e.g., `1.75`) added to the card instance during configuration for Preferred Rewards.
2. **Cap Fallback**: If a `spendingCap` is reached, the engine automatically falls back to the reward tier where `categoryMatch` is set to `all`.
3. **Method Priority**: Apple Pay specific categories (like on the Apple Card) are only recommended if the user indicates they are using Apple Pay.
