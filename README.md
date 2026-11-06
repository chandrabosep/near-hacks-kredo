# Kredo

Kredo is a shared value network for applications. Users carry one balance across every app on the network, and each app is paid in USDT for what its users spend. Every balance is backed 1:1 by USDT held in the `CreditVault` contract on Whitechain.

- **Users** sign in with email. No wallet to install, no seed phrase, no gas. One balance works in every app.
- **Companies** add about 20 lines to their server, charge in credits, and withdraw USDT on Whitechain.
- **Nobody can over-charge.** Each user signs a spending limit per app, and the contract enforces it.

## Live on Whitechain Sepolia (chain ID 1874)

| | |
|---|---|
| CreditVault (verified) | [`0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A`](https://explorer.testnet.whitechain.io/address/0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A) |
| USDT (official test token) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| User deposits 1 USDT (100 credits) | [`0xf20b354c…6d82`](https://explorer.testnet.whitechain.io/tx/0xf20b354ccfb7465566e89fcbd1836da436cf3ff46f45d1f977d73140178d6982) |
| App charges 10 credits through the API | [`0x4207f194…522e`](https://explorer.testnet.whitechain.io/tx/0x4207f194aa90de955282acf10e71350b48b102f48930e0253ab0820675c6522e) |
| An app charges 1 credit through the SDK | [`0x2c29bf64…c8cd`](https://explorer.testnet.whitechain.io/tx/0x2c29bf64852aacb9754b5a02d700e239bcb1f39f39298e5852d6f2ff5190c8cd) |
| Light mode: an app sells 5 of its own credits for 10 of ours | [`0xed0557c3…2507`](https://explorer.testnet.whitechain.io/tx/0xed0557c3e8ad850463d7748c9a6ccaac4741b7767c6fffc0cedb82aaf5c32507) |
| App is paid out 0.1425 USDT | [`0xf69cd025…ae50`](https://explorer.testnet.whitechain.io/tx/0xf69cd025c9a3c49414df0a39c48f8cc0743af07ca80b68f642cf684a9cf1ae50) |

## Why onchain settlement

A normal payment rail can't stop the operator from over-charging a user or issuing credits that aren't backed. The vault does: every credit exists only because USDT arrived, every charge stays inside a limit the user signed, and `checkBacking()` proves the vault's USDT covers every balance at any moment. Companies are paid in USDT by the contract itself, on a chain where a payment costs a fraction of a cent.

## How it works

```
 Partner apps                                Hosted pages (apps/web)
   React kit  ── popup ───────────────────►  connect · buy · wallet · claim
   server + SDK ──┐                                    │ user signs EIP-712
                  ▼                                    ▼
          ┌──────────────────── API (apps/api) ────────────────────┐
          │ REST · relayer (pays gas, budgets) · indexer · webhooks │
          └───────────────────────────┬────────────────────────────┘
                                      ▼
                  Whitechain: CreditVault holding USDT
          balances · per-app limits · holds · charges · payouts
```

1. A user signs in with email on our pages. Privy makes them an embedded wallet that only they can sign with.
2. They buy credits by signing a USDT permit. Our relayer deposits it and pays the gas.
3. An app asks to connect. The user signs a spending limit for that app. The app's server gets a one-time code, swaps it for the user's address, and can now charge up to the limit.
4. The app charges, or holds and captures for long jobs. Each charge splits into the app's earnings and the network fee, onchain.
5. The app withdraws its earnings in USDT whenever it likes.

## Repo

| Path | What |
|---|---|
| [contracts](contracts) | `CreditVault` in Solidity (Foundry), with unit, fuzz, invariant and fork tests. See its [README](contracts/README.md) |
| [apps/api](apps/api) | REST API, relayer, log indexer, webhooks and a JSON store |
| [apps/web](apps/web) | Hosted pages (Next.js): landing, connect, buy, wallet, claim, company dashboard, reserves, app directory, ops |
| [examples/starter](examples/starter) | The smallest integration: one server file, 10 lines about credits |
| [packages/sdk](packages/sdk) | `@credits/sdk`, the server kit. See its [README](packages/sdk/README.md) |
| [packages/react](packages/react) | `@credits/react`, buttons and a live balance. See its [README](packages/react/README.md) |
| [docs](docs) | Product overview, build plan, design system |

## Run it

Needs Node 22, Foundry and `jq`.

```bash
git clone --recursive https://github.com/chandrabosep/ethglobal-mumbai && cd ethglobal-mumbai
npm install
cp apps/api/.env.example apps/api/.env       # add PRIVY_APP_ID and PRIVY_APP_SECRET for email login
echo "NEXT_PUBLIC_PRIVY_APP_ID=..." > apps/web/.env
```

**Locally**, on a fresh anvil chain with mock USDT:

```bash
npm run dev:local                        # anvil, deploy, API and hosted pages
npm run fund:local -- 0xYourAddress 20   # 20 test USDT for a signed-in user
```

Open [localhost:3000](http://localhost:3000) for the hosted pages, and run [examples/starter](examples/starter) to see an app take credits.

**On Whitechain Sepolia**, against the live vault:

```bash
# apps/api/.env: CHAIN_ID=1874, OPERATOR_KEY (holds WBT and is the vault's operator), ADMIN_TOKEN
npm run start:whitechain
npm run deploy:whitechain                # only for a new vault: reads PRIVATE_KEY from .env
```

Tests: `npm run contracts:test`, `npm run test:api`, `npm run test:sdk`.

## Deploy

[render.yaml](render.yaml) is a Render Blueprint for the API, its database and the web app. In Render, choose **New, Blueprint** and pick this repo.

- **kredo-db** is Render Postgres. The API runs its migrations on start.
- **kredo-api** runs on the Starter plan. Free services sleep, which would stop the indexer.
- **kredo-web** runs on the free plan. It stores nothing.
- Enter the secrets when asked: `OPERATOR_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET` and `NEXT_PUBLIC_PRIVY_APP_ID`. `ADMIN_TOKEN` is generated.
- Add the web URL to the allowed origins in the Privy dashboard. If Render gives different URLs, update `WEB_ORIGINS` and `NEXT_PUBLIC_API_URL` to match.

## Integrate

```ts
import { Credits } from "@credits/sdk";
const credits = new Credits({ apiKey: process.env.CREDITS_API_KEY });

await credits.charge({ user, action: "chat.message", ref: messageId });

const hold = await credits.hold({ user, action: "video.render", quantity: 12 });
try {
  await render(job);
  await credits.capture(hold.holdId);
} catch {
  await credits.release(hold.holdId);
}
```

[examples/starter](examples/starter/server.ts) is the smallest one: connect, swap the code, charge. [packages/sdk/examples/e2e.ts](packages/sdk/examples/e2e.ts) runs every call, including holds, captures, releases, refunds and payouts. The SDK [README](packages/sdk/README.md) covers every call, errors, webhooks and **test mode**: a `uc_test_` key runs the same calls against fake credits, with nothing onchain.

Companies sign up on the dashboard at `/dashboard`: register an app (the network pays the registration gas), get live and test keys, set prices with the dollar value and your cut next to each, and withdraw earnings in USDT.

## Gas

Our relayer pays all gas in WBT. Users and companies never hold it. Measured on Whitechain Sepolia at 5 gwei:

| Action | Gas | WBT |
|---|---|---|
| `charge` | 94,660 | 0.00047 |
| `hold` | 164,006 | 0.00082 |
| `capture` | 78,301 | 0.00039 |
| `release` | 52,028 | 0.00026 |
| `payout` | 52,149 | 0.00026 |

The L1 data fee is under 4,000 wei per transaction. A charge that the user's limit doesn't cover fails in simulation and costs nothing.

## Relayer security

**Who pays gas:** our relayer, in WBT. The 5% network fee on every charge pays for it. On testnet the relayer is funded from the Whitechain faucet.

**What stops a drain.** The contract guards the money:
- The operator key can't charge above the limit a user signed for that app, raise a fee, redirect a payout, or refund to someone who never paid. A leaked key can't move anyone's credits.
- Every credit is backed by USDT in the vault, and `checkBacking()` proves it live.
- Apps learn who a user is only through a one-time code from the connect page, swapped server to server. A visitor can't point an app at someone else's balance.

The relayer guards its gas. Every check runs before sending, so a refused transaction costs nothing:

| Guard | Default |
|---|---|
| Simulate first: a call that would revert is never sent | always |
| Gas per transaction | 500,000 max |
| Gas price | 50 gwei max |
| WBT spent in any 24 hours | 0.25 WBT (about 500 charges) |
| WBT spent on one app in any 24 hours | 0.1 WBT, so one leaked API key can't use up the rest |
| Minimum relayer balance | 0.05 WBT. Below it, only exits go out: release, revoke, payout |
| Writes per API key | 120 per minute |
| Smallest charge, hold, send or claim link | 1 credit, so dust can't burn gas |
| New accounts per IP | 20 per hour |
| Claim-link redemptions per IP | 10 per hour |
| Retried requests | the same `ref` returns the first result, never a second charge |

`GET /v1/admin/ops` shows the relayer's balance, today's spend against the budget, and days of runway.

## Current limitations

- Testnet only. The vault isn't audited and isn't upgradeable: a fix means a new deployment.
- One operator key runs the relayer, and it's also the vault owner on testnet. In production the owner would be a multisig.
- The API keeps its own data in a JSON file. The chain is the source of truth for every balance, so it can be rebuilt from the vault's events, but there's no database or replication yet.
- Users can't cash credits back out to USDT. Only registered apps are paid out.
- One charge per transaction. No batching yet, so gas scales with the number of charges.
- A company can't change its payout address from the dashboard yet. The contract supports it; the page doesn't.
- Test mode keeps its fake balances in memory, so they reset when the API restarts.
- Getting test USDT needs the Whitechain booth: there's no USDT faucet.
