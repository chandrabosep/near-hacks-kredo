# Universal Credits: Overview

**One line:** One balance for every AI app. Buy credits once, in any partner app, and spend the leftover in every other one. Every credit is provably backed.

**For judges:** We moved the credit balance out of each company's database and into a contract the user controls. A credit works in any app, no app can take more than the user approved, and nobody, including us, can issue a credit that isn't backed.

The build plan is in [plan.md](plan.md).

## The problem

- Every AI product sells its own credits: Higgsfield, Claude, Tripo, and dozens more.
- Users buy many small balances, each stuck inside one app.
- Leftover credits go unused while users run out somewhere else.
- New AI apps fight for every signup and every card form.

## The idea

A shared credit network, like a gift card that works in every AI app.

- **Users** buy one balance and use it everywhere.
- **Companies** join through our SDK, keep their own product and brand, and get users who already have a balance.
- **We** run the network: we hold the money, deduct credits, and pay each company.

## How it works

**For a user**
1. Buy credits once, in any partner app, for example 1,000 credits for $10.
2. Use that app. The credits spent go to that company.
3. Open another partner app, connect once, and approve a spending limit.
4. Spend the leftover there. Every app draws from the same balance.
5. Send credits to a friend, or hand them a claim link.
6. See every app, limit and charge in one wallet, and revoke any app at any time.

**For a company**
1. Sign up on the dashboard and get API keys.
2. Set prices in our credits, or set an exchange rate from its own credits.
3. Add our SDK. The company's backend charges credits when a user uses the service.
4. Withdraw earnings in USDT at any time, minus our fee.

**Example**
```
User buys 1,000 credits ($10) in the video app   → $10 goes to the vault
Spends 300 in the video app                      → the video app earns $3
Opens the chat app, sees 700 left, spends 200    → the chat app earns $2
Opens the 3D app with 500 left                   → and so on
```

## Why onchain

A database could show a shared balance. It could not promise any of these.

1. **The user's limit is enforced by the contract, not by us.** When a user connects an app, they sign a spending limit. The contract rejects any charge above it, even one sent from our own operator key. A compromised server can't drain a wallet.
2. **Held credits always come back.** A long job reserves credits. If it succeeds, the company captures them. If it fails, or the company disappears, anyone can release the hold after it expires. No app can trap a user's credits.
3. **Every credit is provably backed.** Each credit is backed by $0.01 of USDT in one vault contract on Whitechain. Credits are created only when USDT arrives. There is no admin mint, and the reserve is never lent out. The contract holds the invariant below, and a public reserves page shows it live.

```
vault USDT = user balances + held + claims + company earnings + fees
```

Only registered companies can withdraw USDT. Users spend credits but don't cash them out, like a gift card.

## Pricing

**1 credit = $0.01, always.** A company never negotiates a rate with us. It only says what something costs in dollars. There are two ways to join:

| Mode | How it works | Example |
|---|---|---|
| **Deep** | Prices in our credits and charges per use through the SDK. Long jobs use hold and capture: reserve at start, charge on success, release on failure. | 5-second video = 40 credits ($0.40) |
| **Light** | Keeps its own credit system. Users convert our credits into its credits, like a top-up. Rate = its dollar price per credit ÷ $0.01. Easier to adopt. | It sells 1,000 credits for $20, so 1 of its credits = 2 of ours |

- Prices are always shown in both forms: "40 credits ($0.40)".
- A price is locked when a job starts, so users are never surprised mid-job.
- Our fee comes out of the company's share, so users pay exactly the listed price.
- Balances are stored in USDT's smallest unit, so fractions of a credit stay exact.

## What the user sees onchain

Nothing. Users only use the apps. Our backend turns their actions into Whitechain transactions and pays the gas, so nobody holds a gas token or sees a crypto step.

Buying, connecting or revoking an app, charges, holds, sends and claim links all settle onchain within seconds. Company payouts settle when the company clicks Withdraw, or on a schedule. Our backend submits every transaction, but the contract only accepts charges within the limit each user signed for each app, and every charge can be checked from the wallet.

## What we build

| Piece | What it does |
|---|---|
| CreditVault contract | Holds the USDT and every balance, app limit, hold, charge and payout, on Whitechain |
| Connect screen | A hosted approval screen, like "Sign in with Google": "Video Studio wants up to 200 credits." Email login, no crypto knowledge needed. |
| Buy page | Buy credits from inside any partner app |
| User wallet | Balance, connected apps and limits, revoke, send, claim links, and activity |
| Company dashboard | Registration, API keys, price list, test mode, revenue, and USDT withdrawals |
| SDK | Frontend kit (connect button, buy button, balance widget), backend kit (quote, charge, hold and capture, refund, convert, webhooks), and test mode with fake credits |
| Reserves page | Shows live that every credit is backed |
| App directory | Lists every app that accepts credits, with its prices |

## Business model

- A fee on each charge, like a card network, taken from the company's share.
- Later: optional premium tools for companies, such as analytics and promotions.

## Competition

| Type | Examples | What they miss |
|---|---|---|
| Aggregators | Higgsfield, Picsart, LoveGen | One credit for many models, but only inside their own app |
| Credit networks | OpenCredits, Quota, rNet | AI model calls only, Stripe-based, credits locked to the platform |
| Provider login | Sign in with ChatGPT | Only OpenAI models and OpenAI plans |

**Our gap:** the user holds the balance, companies price their own services, the contract enforces every limit, and we pay each company.

## Hackathon pitch (ETHGlobal Mumbai)

**Sponsor:** Whitechain. All its tracks count as one partner prize, so we enter both:
- **Scale, Payments Nobody Notices ($3k):** the payer sees no crypto steps and the business side pays gas.
- **Operate, Stablecoin Payments for Business ($5k):** a merchant payment flow with a drop-in piece, shown from both the merchant and customer views.

**Not in scope:** other chains, AI agents, user cash-out, card payments, batched charges, promo credits, and a tradable token.

**Demo merchants:** a video app, a chat app and a 3D app, running on real AI APIs. Each joins only through our public SDK and dashboard, like any outside company.
