# Kredo: Build Plan

**What we're building:** buy credits once, in any partner app, and spend the leftover in every other one. Each company is paid in USDT for what its users spend. The product story is in [overview.md](overview.md).

**Chain:** NEAR testnet. Credits are backed 1:1 by a NEP-141 test USDT with 6 decimals, the same shape as USDt on NEAR mainnet (`usdt.tether-token.near`).

**Checkboxes** are ticked only when the work is merged to `main`.

---

## 1. Rules everyone builds against

| Rule | Value |
|---|---|
| 1 credit | $0.01 |
| Internal unit | USDT's smallest unit. USDT has **6 decimals**, so **1 credit = 10,000 units.** Store and send every amount in units; divide only for display. |
| Backing | Credits are created only when USDT arrives in the vault through `ft_transfer_call`. No admin mint. |
| Network fee | Taken at each charge (e.g. 5% = 500 bps, set per app, capped at 20%). The user pays exactly the listed price. |
| Who can be paid out | Registered apps only |
| Expiry | Credits never expire |
| Gas | Our relayer pays it. Users and companies never hold NEAR. |
| Source of truth | The chain. Our database is a fast copy for answering requests instantly. |

**Backing check, enforced in the contract:**
```
usdt.ft_balance_of(vault) >= Σ user balances + Σ held + Σ claims + Σ app earnings + protocol fees
```

### 1a. Accounts on testnet

| | |
|---|---|
| Vault | `vault.kredo-network.testnet` |
| Test USDT | `usdt.kredo-network.testnet` (NEP-141, `USDT`, **6** decimals, owner-only mint for the faucet) |
| Owner and fee recipient | `kredo-network.testnet` |
| Operator (relayer) | `relayer.kredo-network.testnet` |
| RPC / explorer | `https://test.rpc.fastnear.com` / `https://testnet.nearblocks.io` |

Users never sign typed data. They call `approve_app`, `revoke_app`, `send` and `create_claim` directly, as meta transactions (NEP-366) that the relayer pays gas for, so the contract reads the user from `predecessor_account_id`.

---

## 2. Core build (milestone 0)

The contract, backend, SDK, hosted pages and first demo app, running locally. Each bullet is roughly one commit. Run the tests at every commit.

Never commit secrets, local data or build output. Commit example env files instead.

**Scaffold**
- [x] npm workspaces: `apps/web` (Next.js, Tailwind, shadcn), `apps/api` (Express)
- [x] Cargo workspace for the contracts, on `near-sdk` 5

**Contracts**
- [x] test USDT: NEP-141 with 6 decimals, storage management and an owner mint
- [x] vault state, running totals, owner/operator roles, `pause()`, two-step ownership
- [x] app registry (`register_app`, payout account, `fee_bps`, `max_charge`)
- [x] deposits through `ft_on_transfer`, for yourself or someone else; other tokens and dust are refunded
- [x] `approve_app` / `revoke_app` with an optional expiry
- [x] `charge` with the limit check, fee split and per-charge cap. Over-limit fails **even from the operator**, and every `ref` is single use.
- [x] `hold` → `capture` / `release`. Anyone can release after expiry. A partial capture returns the unused part.
- [x] `refund`, capped at what the user spent with that app
- [x] `send`, and claim links: `create_claim` / `claim` / `cancel_claim`, signed with an ed25519 claim key
- [x] `payout(app)` and `withdraw_fees()`, restoring the balance if the USDT transfer fails
- [x] unit tests for each, with the backing check asserted after every one
- [x] deploy both contracts to testnet and record them in `contracts/deployments/testnet.json`

**Backend: foundation**
- [x] project setup, config and example env
- [x] database and store
- [x] relayer queue (ordered sends, receipt wait, gas recorded per transaction)
- [x] user login with Privy: email code, identity token verified on the backend

**Backend: API**
- [x] server bootstrap and `/v1/health`
- [x] auth routes (Privy for users, API keys for companies, admin token)
- [x] pricing and price routes (flat, per-unit, `quote`)
- [x] buy routes
- [x] connection routes (approve/revoke)
- [x] charge, hold, capture, release and refund routes
- [x] send, claim and convert routes
- [x] app routes: payout, gas, CSV export, webhook settings
- [x] rate limits (120 writes/min per API key, 429 with retry-after)

**Indexer**
- [x] event indexer with a short poll and a backing-check alarm
- [x] expired-hold sweeper and HMAC-signed webhooks
- [x] user and merchant activity, stats

**SDK**
- [x] backend kit: client and auth, `quote`, `charge`, `hold`, `capture`, `release`, `refund`
- [x] the rest: `convert`, `connect`, `disconnect`, `balance`, `setPrices`, `payout`, `activity`, `exportCsv`, `gas`, `setWebhook`, network-side helpers
- [x] end-to-end demo script

**Hosted pages**
- [x] shared styles and helpers
- [x] connect page
- [x] buy page
- [x] wallet page
- [x] claim page
- [x] landing page

**React kit**
- [x] provider and `useCredits()`
- [x] `<ConnectCreditsButton/>`, `<BuyCreditsButton/>`
- [x] `<CreditsBalance/>` dropdown

**Dev scripts**
- [x] local dev script
- [x] README: setup and the SDK usage page

Tag `m0-core` when everything above runs locally.

---

## 3. Architecture

```
 Demo apps (chat / images and video)     Hosted pages (ours)
   frontend kit ─────────────────────►  Connect · Buy · Account · Dashboard
   backend kit ──┐                                │
                 ▼                                ▼
            ┌─────────────── OUR BACKEND ───────────────┐
            │ REST API · database · relayer · indexer   │
            └──────────────────────┬────────────────────┘
                                   ▼
                  NEAR: Kredo vault (USDT)
          balances, app limits, holds, charges, payouts
```

Backend API (authenticated with each company's API key):
```
GET  /v1/users/:id/balance
GET  /v1/prices/:action          → quote in credits and dollars
POST /v1/charges                 { user, amount, ref }
POST /v1/holds                   { user, amount, expiry }  → holdId
POST /v1/holds/:id/capture       { actual }
POST /v1/holds/:id/release
POST /v1/refunds                 { user, amount }
POST /v1/convert                 { user, credits }          (light mode)
Webhooks: charge.succeeded, hold.captured, hold.released, connection.revoked
```

---

## 4. Build steps after milestone 0

### Step 1: Accounts and testnet funds
- [x] Accounts: owner, operator/relayer, fee recipient (keys never committed)
- [x] Test USDT minted to the faucet and the demo users
- [ ] Record the real gas cost of one `charge`

### Step 2: Contracts live on testnet
- [x] Deploy the vault and test USDT
- [x] Put the accounts and a real deposit transaction in the README

### Step 3: Gas economics and anti-drain
- [x] Relayer retries
- [x] Ops panel (hidden route): relayer balance, transactions today, gas spent today, days of runway
- [x] Daily gas budget with auto-pause, per-transaction gas ceiling
- [x] Per-IP limits on signup and claim; minimum amounts on charge and send
- [x] README "Gas and safety" section

### Step 4: SDK test mode and starter app
- [x] Test mode: test API keys that work with fake credits
- [x] A bare starter app; count its lines for the "about 20 lines" claim

**Done when:** a brand-new app integrates using only the README.

### Step 5: Company dashboard
- [x] Register an app, get test and live API keys
- [x] Price list in credits with the dollar value next to each price (flat or per-unit)
- [x] "What you earn" preview: dollar value and payout after fee
- [x] Light mode: set the rate from the company's own credits
- [x] Revenue, charges and unpaid earnings
- [x] **Withdraw** button that pays USDT
- [x] Gas line: "Your charges cost N in gas this period, covered by your network fee"
- [x] CSV export of charges, refunds and payouts

**Done when:** a company can register, set prices, see a charge arrive and withdraw USDT.

### Step 6: Demo apps, built only with the public SDK
- [x] Parley (chat): `charge()` per message, refund if the model fails
- [x] Lumen (images and video): per-image charges, `hold()`/`capture()` per second of video
- [x] Each app has the balance pill, connect and buy buttons
- [x] Real AI keys, with a demo mode when none are set

### Step 7: Reserves page and ecosystem
- [x] Reserves page: the vault's USDT next to total credits outstanding, live from the chain
- [x] Ecosystem page: every app with its prices

### Step 8: Everything on NEAR
- [x] Relayer and indexer on `near-api-js`: operator calls, signed delegates, events from outcomes
- [x] Hosted pages sign in with a Privy NEAR wallet and sign every action as a delegate action
- [x] API tests against an in-memory NEAR chain with the vault's rules
- [ ] SDK end-to-end script run against testnet
- [ ] Demo apps registered on the testnet vault
