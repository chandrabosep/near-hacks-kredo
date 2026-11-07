# Kredo

**One balance. Every app.** Kredo is a shared value network for applications. Users carry one balance across every app on the network, and each app is paid in USDT for what its users spend. Every balance is backed 1:1 by USDT in the `CreditVault` contract on Whitechain.

- **Users** sign in with email. No wallet, no seed phrase, no gas.
- **Companies** add about 20 lines of code, charge per use, and withdraw USDT any time.
- **Nobody can over-charge.** Each user signs a spending limit per app, and the contract enforces it.

| | |
|---|---|
| App | [kredo-omega.vercel.app](https://kredo-omega.vercel.app) |
| Demo apps | [Parley](https://parley-chi-sepia.vercel.app) (AI chat) · [Lumen](https://lumen-gamma-rouge.vercel.app) (AI images and video) |
| Docs | [kredo-omega.vercel.app/docs](https://kredo-omega.vercel.app/docs) |
| Packages | [`kredo`](https://www.npmjs.com/package/kredo) (server) · [`kredo-react`](https://www.npmjs.com/package/kredo-react) (React) |
| API | [kredo-api.onrender.com/v1/health](https://kredo-api.onrender.com/v1/health) |
| Demo video | link to be added |

## Why onchain stablecoin settlement on Whitechain

A balance shared by many companies only works if no one can touch it, including us. A card or bank rail runs on trust in whoever keeps the ledger. It can't stop that party from over-charging a user, issuing credits with nothing behind them, or holding back an app's earnings. The vault can:

- A credit exists only when USDT arrives, and `checkBacking()` proves the vault covers every balance, live.
- A charge above the limit the user signed is rejected by the contract, even from our own operator key.
- Apps are paid in USDT by the contract itself, with no payout schedule and no chargebacks.

Whitechain makes per-use pricing possible. A charge costs about 0.00047 WBT, so a 1 cent message settles onchain. A card payment costs around 30 cents, so a 1 cent sale is impossible.

## Onchain proof

Whitechain Sepolia, chain ID 1874, official test USDT only.

| | |
|---|---|
| CreditVault, verified | [`0xaaA19C71…664A`](https://explorer.testnet.whitechain.io/address/0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A?tab=contract) |
| USDT | [`0xcedfB561…55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| A user deposits 1 USDT (100 credits) | [`0xf20b354c…6d82`](https://explorer.testnet.whitechain.io/tx/0xf20b354ccfb7465566e89fcbd1836da436cf3ff46f45d1f977d73140178d6982) |
| An app charges 10 credits through the API | [`0x4207f194…522e`](https://explorer.testnet.whitechain.io/tx/0x4207f194aa90de955282acf10e71350b48b102f48930e0253ab0820675c6522e) |
| An app charges 1 credit through the SDK | [`0x2c29bf64…c8cd`](https://explorer.testnet.whitechain.io/tx/0x2c29bf64852aacb9754b5a02d700e239bcb1f39f39298e5852d6f2ff5190c8cd) |
| An app sells 5 of its own credits for 10 of ours | [`0xed0557c3…2507`](https://explorer.testnet.whitechain.io/tx/0xed0557c3e8ad850463d7748c9a6ccaac4741b7767c6fffc0cedb82aaf5c32507) |
| An app is paid out 0.1425 USDT | [`0xf69cd025…ae50`](https://explorer.testnet.whitechain.io/tx/0xf69cd025c9a3c49414df0a39c48f8cc0743af07ca80b68f642cf684a9cf1ae50) |

## How it works

```
 Partner apps                                Hosted pages (apps/web)
   React kit  ── popup ───────────────────►  connect · buy · account · claim
   server + SDK ──┐                                    │ user signs EIP-712
                  ▼                                    ▼
          ┌──────────────────── API (apps/api) ────────────────────┐
          │ REST · relayer (pays gas, budgets) · indexer · webhooks │
          └───────────────────────────┬────────────────────────────┘
                                      ▼
                  Whitechain: CreditVault holding USDT
          balances · per-app limits · holds · charges · payouts
```

1. **Sign in.** A user signs in with email. Privy gives them an embedded wallet only they can sign with.
2. **Buy.** They sign a USDT permit. Our relayer deposits it and pays the gas.
3. **Connect.** An app asks to connect, and the user signs a spending limit for it.
4. **Spend.** The app charges per use, or holds credits for a long job and captures them when it's done. Each charge splits onchain into the app's earnings and a 5% network fee.
5. **Get paid.** The app withdraws its earnings in USDT whenever it likes.

## Integrate

```bash
npm install kredo          # server
npm install kredo-react    # buttons and a live balance, optional
```

```ts
import { Credits } from "kredo";
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

Companies sign up on the [dashboard](https://kredo-omega.vercel.app/dashboard): register an app (the network pays the gas), get live and test keys, set prices, and withdraw USDT. A test key runs the same calls with fake credits. See [examples/starter](examples/starter/server.ts) for the smallest app, and the [SDK README](packages/sdk/README.md) for every call.

## Hackathon

Built at ETHGlobal Mumbai, 5 to 8 November 2026. First commit: [`562ee84`](https://github.com/chandrabosep/ethglobal-mumbai/commit/562ee84).

**Operate: Stablecoin Payments for Business**
- **Drop in:** `kredo` and `kredo-react`. [Parley](demos/parley) and [Lumen](demos/lumen) are separate apps built only on them.
- **Customer:** connect, buy, approve a limit, spend. Manage apps, send credits or share a claim link from the account page.
- **Merchant:** register an app, set prices, and see revenue and every charge with its transaction.
- **After the first payment:** holds, refunds capped onchain, USDT payouts, signed webhooks, and a CSV export for the accountant.

**Scale: Payments Nobody Notices**
- **No crypto for the payer:** email login, no seed phrase, no WBT, no chain picker.
- **Gasless:** deposits use the USDT `permit` (EIP-2612), and the vault also accepts `receiveWithAuthorization` (EIP-3009). Limits, sends and claims are EIP-712 signatures that our relayer submits.
- **Who pays gas:** the relayer, funded with WBT from the faucet and paid back by the 5% fee. See [Gas and safety](#gas-and-safety) for what stops a drain.

| Requirement | Where |
|---|---|
| Contracts deployed and verified on chain 1874 | [contracts](contracts/README.md#deployed) |
| USDT payment in the main flow | [Onchain proof](#onchain-proof) |
| Why onchain stablecoin settlement | [Why onchain](#why-onchain-stablecoin-settlement-on-whitechain) |
| Setup, architecture, limitations | [Run it](#run-it), [How it works](#how-it-works), [Limitations](#limitations) |
| Demo video | top of this page |
| Feedback | [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md) |

## Gas and safety

Our relayer pays all gas in WBT. Users and companies never hold it. Measured at 5 gwei:

| Action | Gas | WBT |
|---|---|---|
| `charge` | 94,660 | 0.00047 |
| `hold` | 164,006 | 0.00082 |
| `capture` | 78,301 | 0.00039 |
| `release` | 52,028 | 0.00026 |
| `payout` | 52,149 | 0.00026 |

**The contract guards the money.** The operator key can't charge above a signed limit, raise a fee, redirect a payout, or refund someone who never paid. Apps learn who a user is only through a one-time code, swapped server to server.

**The relayer guards its gas.** Every check runs before sending, so a refused transaction costs nothing.

| Guard | Default |
|---|---|
| Simulate first | a call that would revert is never sent |
| Gas cap | 500,000 per transaction, 50 gwei max |
| Daily budget | 0.25 WBT in total, 0.1 WBT per app |
| Floor | below 0.05 WBT, only exits go out: release, revoke, payout |
| Rate limits | 120 writes per minute per key, 20 new accounts per hour per IP |
| Minimum amount | 1 credit, so dust can't burn gas |
| Retries | the same `ref` returns the first result, never a second charge |

## Run it

Needs Node 22, Foundry and `jq`.

```bash
git clone --recursive https://github.com/chandrabosep/ethglobal-mumbai && cd ethglobal-mumbai
npm install
cp apps/api/.env.example apps/api/.env       # add PRIVY_APP_ID and PRIVY_APP_SECRET
echo "NEXT_PUBLIC_PRIVY_APP_ID=..." > apps/web/.env
```

```bash
# Local chain with mock USDT
npm run dev:local
npm run fund:local -- 0xYourAddress 20

# Whitechain Sepolia: set CHAIN_ID=1874, OPERATOR_KEY and ADMIN_TOKEN in apps/api/.env
npm run start:whitechain
```

Open [localhost:3000](http://localhost:3000). Tests: `npm run contracts:test`, `npm run test:api`, `npm run test:sdk`.

**Deploy.** The web app runs on Vercel ([apps/web/vercel.json](apps/web/vercel.json)) and the API on Render ([render.yaml](render.yaml)). Both redeploy on every push to `main`. Packages publish with `npm publish -w kredo` and `npm publish -w kredo-react`.

## Repo

| Path | What |
|---|---|
| [contracts](contracts) | `CreditVault` in Solidity, with unit, fuzz, invariant and fork tests |
| [apps/api](apps/api) | REST API, relayer, indexer and webhooks, on Postgres |
| [apps/web](apps/web) | Landing, connect, buy, account, send, claim, dashboard, reserves, docs |
| [packages/sdk](packages/sdk) · [packages/react](packages/react) | `kredo` and `kredo-react` |
| [demos](demos) | Parley and Lumen |
| [examples/starter](examples/starter) | The smallest integration, in one file |
| [docs](docs) | Product overview, plan, design system, Whitechain notes |

## Limitations

- Testnet only. The vault isn't audited or upgradeable.
- One key is owner and operator on testnet. In production the owner would be a multisig.
- Users can't cash credits out to USDT. They can send them or share a claim link. Only apps are paid out.
- One charge per transaction, with no batching yet.
- Payout addresses can't be changed from the dashboard yet. The contract supports it.
- Test mode balances live in memory and reset when the API restarts.
- Each new account gets 0.5 test USDT once, from a small faucet with a daily cap.
