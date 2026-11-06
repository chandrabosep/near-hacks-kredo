# Universal Credits: Build Plan (ETHGlobal Mumbai)

**What we're building:** buy credits once, in any partner app, and spend the leftover in every other one. Each company is paid in USDT for what its users spend. The product story is in [overview.md](overview.md).

**Chain:** Whitechain only (OP Stack L2, Sepolia testnet, chain ID 1874). Credits are backed 1:1 by the official Whitechain test USDT.

**Submission closes Saturday 7 Nov, 9:00 am IST.** No late entries.

**Checkboxes** are ticked only when the work is merged to `main`.

---

## 1. Event rules we must follow

Hard rules from the event page. Breaking one can disqualify us.

- [ ] Commit history shows the work happening during the event. No single giant commit.
- [ ] Public GitHub repo with steady commits.
- [ ] Demo video: 2 to 4 minutes, 720p or better, narrated by a person. No AI voiceover, no music over text slides, no phone recording, no sped-up footage.
- [ ] At submission, choose "Finalist and Partner Prizes".

---

## 2. Prize targets

| Target | What it needs from us |
|---|---|
| **Whitechain: Scale, Payments Nobody Notices ($3k). Strongest track.** | The payer sees no crypto steps, and the business side pays gas. Judges ask directly: who pays gas, how the relayer gets WBT, what stops a drain. |
| **Whitechain: Operate, Stablecoin Payments for Business ($5k)** | A drop-in piece a separate app adds in about 20 lines, shown from both the merchant and the customer view. Extra credit for flows past the first payment: refunds, holds, CSV export. |
| **ETHGlobal Finalist (top 10)** | Technicality, Originality, Practicality, Usability, WOW. 7 minutes: 4 minute demo, 3 minute Q&A. |

All Whitechain tracks count as one partner prize, so we enter both Scale and Operate. ENS is optional, only if there's time.

---

## 3. Rules everyone builds against

| Rule | Value |
|---|---|
| 1 credit | $0.01 |
| Internal unit | USDT's smallest unit. Whitechain test USDT has **6 decimals**, so **1 credit = 10,000 units.** Store and send every amount in units; divide only for display. |
| Backing | Credits are created only when USDT arrives in the vault. No admin mint. |
| Network fee | Taken at each charge (e.g. 5% = 500 bps, set per app). The user pays exactly the listed price. |
| Who can be paid out | Registered companies only |
| Expiry | Credits never expire |
| Gas | Our relayer pays it in WBT. Users and companies never hold WBT. |
| Source of truth | The chain. Our database is a fast copy for answering requests instantly. |

**Backing check, enforced in the contract:**
```
USDT held by CreditVault == Σ user balances + Σ held + Σ claims + Σ company earnings + protocol fees
```

### 3a. Whitechain test USDT (checked onchain and in the verified source, 5 Nov)

| | |
|---|---|
| Address | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (EIP-1967 proxy) |
| Implementation | `0x26425662D126412128967ECf0a02EC48573026F7`, `TetherTokenV2`, verified |
| Name / symbol / decimals | `Tether USD` / `USDT` / **6** |
| EIP-712 domain | name `Tether USD`, version `1`, chainId `1874`, verifyingContract = the proxy |
| Gasless entry points | EIP-2612 `permit` and EIP-3009 `receiveWithAuthorization` (`to` must be `msg.sender`) |
| Minting | Owner only. **No USDT faucet.** Get test USDT from the Whitechain booth. The WBT faucet (`faucet.testnet.whitechain.io`, GitHub login, once per 24h) gives gas only. |
| RPC / explorer | `https://rpc.testnet.whitechain.io` / `https://explorer.testnet.whitechain.io` (Blockscout: `forge verify-contract --verifier blockscout`) |

The mock USDT is for local Foundry tests only. It mirrors this surface so tests sign exactly what the real token checks. **Never deploy it to Whitechain** (the deploy script refuses on chain 1874).

### 3b. Whitechain qualification checklist (hard requirements for every track)

- [x] Contracts deployed on Whitechain Sepolia (1874) and **verified** on the explorer
- [x] At least one **USDT payment settled on Whitechain in the main flow**, with the explorer link in the README. Self-minted test tokens don't count.
- [ ] README line: why this flow needs onchain stablecoin settlement on Whitechain, and what a normal payment rail couldn't do. (A rail can't stop us over-charging or over-issuing. The contract does.)
- [ ] README covers setup, architecture and **current limitations**
- [ ] 2 to 4 minute video showing **each party**: customer, merchant, and the relayer's gas view
- [ ] Whitechain feedback doc (RPC limits, faucet, explorer verification, anything that bit us)

---

## 4. Core build (milestone 0)

The contract, backend, SDK, hosted pages and first demo app, running locally. Each bullet is roughly one commit. Run the tests at every commit.

Never commit secrets, local data or build output. Commit example env files instead.

**Scaffold**
- [x] npm workspaces: `apps/web` (Next.js, Tailwind, shadcn), `apps/api` (Express, viem)
- [x] Foundry project with the Whitechain testnet RPC
- [x] `forge-std` and OpenZeppelin as git submodules

**Vault: core** (built in slices, each with its tests)
- [x] mock USDT with 6 decimals, the `Tether USD` / `1` domain, `permit`, `receiveWithAuthorization`
- [x] vault skeleton: storage, running totals, owner/operator roles, `pause()`, `checkBacking()`
- [x] app registry (`registerApp`, payout address, `feeBps`) and its tests
- [x] `deposit` and tests, including the backing check
- [x] `depositWithPermit` (try/catch around permit) and `depositWithAuthorization`, with tests: relayed by a stranger, after a front-run permit, bad signature, nonce replay, wrong `to`

**Vault: limits and charges**
- [x] EIP-712 `approveApp` / `revokeApp`, signed or direct, with tests
- [x] `charge` with the limit check, fee split and per-charge cap. Tests: over-limit reverts **even from the operator key**, charge after revoke reverts.
- [x] `hold` → `capture` / `release`. Anyone can release after expiry. A partial capture returns the unused part to the limit. Tests for each.
- [x] `refund` and tests

**Vault: transfers and payouts**
- [x] `send` (user to user, signed) and tests
- [x] `createClaim` / `claim` / `cancelClaim` and tests
- [x] `payout(app)`, `withdrawFees()` and tests. The backing check is asserted after every test.
- [x] fork test against the real Whitechain USDT
- [x] deploy script: defaults to the official USDT on 1874 and refuses the mock there
- [x] contracts README and example env

**Backend: foundation**
- [x] project setup, config and example env
- [x] ABI generation from the contracts
- [x] JSON-file database and store
- [x] relayer queue (serial nonces, receipt wait, gas recorded per tx)
- [x] user login with Privy: email code, embedded wallet, identity token verified on the backend

**Backend: API**
- [x] server bootstrap and `/v1/health`
- [x] auth routes (Privy for users, API keys for companies, admin token)
- [x] pricing and price routes (flat, per-unit, `quote`)
- [x] buy routes (permit typed data, relayed deposit)
- [x] connection routes (approve/revoke)
- [x] charge, hold, capture, release and refund routes
- [x] send, claim and convert routes
- [x] app routes: payout, gas, CSV export, webhook settings
- [x] rate limits (120 writes/min per API key, 429 with retry-after)

**Indexer**
- [x] log indexer: `eth_getLogs` paged by 1,000 blocks, 2s poll, backing-check alarm
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
- [ ] `<CreditsBalance/>` dropdown

**Video app**
- [ ] app scaffold (Vite, server)
- [ ] hold on start, capture on success, release on failure

**Dev scripts**
- [ ] local dev script (anvil → deploy → backend) and video app script
- [ ] Whitechain deploy and start scripts
- [ ] README: setup and the SDK usage page

Tag `m0-core` when everything above runs locally.

---

## 5. Architecture

```
 Demo apps (video / chat / 3D)          Hosted pages (ours)
   frontend kit ─────────────────────►  Connect · Buy · Wallet · Dashboard
   backend kit ──┐                                │
                 ▼                                ▼
            ┌─────────────── OUR BACKEND ───────────────┐
            │ REST API · database · relayer · indexer   │
            └──────────────────────┬────────────────────┘
                                   ▼
                  WHITECHAIN: CreditVault (USDT)
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

## 6. Build steps after milestone 0

### Step 1: Wallets and testnet funds
- [ ] Wallets: deployer, operator/relayer, fee recipient (keys never committed)
- [ ] WBT for gas from the faucet; test USDT from the Whitechain booth (a few thousand, spread over the demo user wallets)
- [ ] Ask the booth: does the vault design count as "USDT payments settled on Whitechain"?
- [x] Record the real gas cost of one `charge()`

**Done when:** everyone can run the repo and the wallets hold testnet funds.

### Step 2: Deploy CreditVault to Whitechain
- [x] Deploy against the official test USDT; commit the deploy broadcast
- [x] Verify on the Whitechain explorer
- [x] Put the vault address and a real deposit tx link in the README

**Done when:** the verified contract is on the explorer. Tag `m1-contract-deployed`.

### Step 3: Backend on Whitechain, gas economics and anti-drain
- [x] Run the backend against Whitechain; a curl charge appears on the explorer and in the database (tag `m2-charge-end-to-end`)
- [ ] Relayer retries
- [ ] Ops panel (hidden route): relayer WBT balance, txs today, WBT spent today, days of runway
- [x] Daily WBT budget with auto-pause, per-tx gas ceiling
- [ ] Per-IP limits on signup and claim; minimum amounts on charge and send
- [x] README "Relayer security" section, updated with the real numbers

### Step 4: SDK test mode and starter app
- [ ] Test mode: test API keys that work with fake credits
- [ ] A bare starter app; count its lines for the "about 20 lines" claim

**Done when:** a brand-new app integrates using only the README. This is the Operate drop-in piece.

### Step 5: Company dashboard
- [ ] Register an app, get test and live API keys
- [ ] Price list in credits with the dollar value next to each price (flat or per-unit)
- [ ] "What you earn" preview: dollar value and payout after fee
- [ ] Light mode: set the rate from the company's own credits
- [ ] Revenue, charges and unpaid earnings
- [ ] **Withdraw** button that pays USDT on Whitechain
- [ ] Gas line: "Your charges cost N WBT in gas this period, covered by your network fee"
- [ ] CSV export of charges, refunds and payouts

**Done when:** a company can register, set prices, see a charge arrive and withdraw USDT. Tag `m3-dashboard-payouts`.

### Step 6: Demo apps, built only with the public SDK
- [ ] Video app running on Whitechain
- [ ] Chat app: an instant `charge()` per message, on a real AI API
- [ ] 3D app: light mode, converts our credits into its own
- [ ] Each app has a buy button

**Done when:** one user buys in the video app and spends the leftover in the chat and 3D apps. Tag `m4-three-apps`.

### Step 7: Reserves page and app directory
- [ ] Reserves page: the vault's USDT next to total credits outstanding, live from the chain
- [ ] App directory: every app with its prices
- [ ] (Optional) ENS names for apps, with prices in their records
