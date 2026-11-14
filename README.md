# Kredo

**One balance. Every app.** Kredo is a shared value network for applications. Users carry one balance across every app on the network, and each app is paid in USDT for what its users spend. Every balance is backed 1:1 by USDT in the Kredo vault contract on NEAR.

- **Users** sign in with email. No wallet, no seed phrase, no gas.
- **Companies** add about 20 lines of code, charge per use, and withdraw USDT any time.
- **Nobody can over-charge.** Each user sets a spending limit per app, and the contract enforces it.

| | |
|---|---|
| App | [kredo-near.vercel.app](https://kredo-near.vercel.app) |
| Demo apps | [Parley](https://kredo-near-parley.vercel.app) (AI chat) · [Lumen](https://kredo-near-lumen.vercel.app) (AI images and video) |
| Docs | [kredo-near.vercel.app/docs](https://kredo-near.vercel.app/docs) |
| Packages | [`kredo`](https://www.npmjs.com/package/kredo) (server) · [`kredo-react`](https://www.npmjs.com/package/kredo-react) (React) |
| API | [kredo-near-api.onrender.com/v1/health](https://kredo-near-api.onrender.com/v1/health) |
| Demo video | link to be added |

## Provenance: ported from an EVM build

Kredo was first built at **ETHGlobal Mumbai** (5 to 7 Nov 2026) on **Whitechain Sepolia**, an EVM chain (chain ID 1874), with a Solidity `CreditVault`. That version is still live at [kredo-omega.vercel.app](https://kredo-omega.vercel.app), and `kredo@0.1.0` / `kredo-react@0.1.x` on npm (6 Nov) are its packages. For this hackathon it was ported to NEAR.

**Old and new work, kept apart.** This repo's history starts with the EVM build's 85 commits exactly as they were made (5 to 7 Nov), ending at the tag `ethglobal-final`. Every commit after that tag is the NEAR port, committed on 13 Nov, plus README updates on 14 Nov.

| | |
|---|---|
| Original EVM build | tag [`ethglobal-final`](https://github.com/chandrabosep/near-hacks-kredo/tree/ethglobal-final) and every commit before it |
| First cut of the port (13 Nov 18:11, the v1 vault) | tag [`hackathon-submission`](https://github.com/chandrabosep/near-hacks-kredo/tree/hackathon-submission) |
| **This submission** (adds NEP-145 storage, app-signed charges and `vault-v2`) | tag [`hackathon-final`](https://github.com/chandrabosep/near-hacks-kredo/tree/hackathon-final) |
| Everything the port changed, as one diff | [`ethglobal-final...hackathon-final`](https://github.com/chandrabosep/near-hacks-kredo/compare/ethglobal-final...hackathon-final) |

Timeline, with outside records:

| Event | When (UTC) | Record |
|---|---|---|
| EVM build, first to last commit | 5 Nov 16:31 to 7 Nov 03:25 | commits up to `ethglobal-final` |
| `kredo@0.1.0` published (EVM) | 6 Nov 18:54 | [npm](https://www.npmjs.com/package/kredo?activeTab=versions) |
| First NEAR vault, test USDT and first deposit | 13 Nov 14:52 | [vault deploy tx](https://testnet.nearblocks.io/txns/7fd62FuSFSDY6huZzcCZX1tPza75ZRuBrwczZLBqoegw) |
| `kredo@0.2.0` and `0.2.1` published (NEAR) | 13 Nov 17:46 to 17:49 | [npm](https://www.npmjs.com/package/kredo?activeTab=versions) |
| NEAR port committed | 13 Nov 18:11 | commits from `ethglobal-final` to `hackathon-submission` |
| NEP-145 storage and app-signed charges committed, `vault-v2` deployed | 13 Nov 18:44 to 20:45 | [PR #1](https://github.com/chandrabosep/near-hacks-kredo/pull/1), [vault-v2 deploy tx](https://testnet.nearblocks.io/txns/BesTccaHC9MdESr9yx5wMKSvrXZDQtnMAU4prjcwvUAL) |

**New for NEAR** (everything else, such as the hosted pages, dashboard, docs site, SDK surface and the Parley and Lumen demos, was carried over and only adapted for NEAR account IDs):

- **Vault contract rewritten in Rust** ([contracts/vault](contracts/vault/src/lib.rs)): deposits through `ft_transfer_call`, per-app limits, charge, hold, capture and release, refunds, transfers, claim links and payouts, with NEP-297 events and 61 unit tests. It replaces the Solidity `CreditVault` and its Foundry tests, which are removed.
- **Apps sign their own charges** with a NEAR sub-account and a function-call key (see [Security](#security-who-can-move-money)). The EVM build had one operator that could charge for every app. On NEAR, Kredo's keys can't charge anyone.
- **NEP-145 storage, paid by whoever adds the state** ([`storage_deposit`](contracts/vault/src/lib.rs)). A deposit, approval or send can't make the vault pay NEAR for someone else's data.
- **Test USDT as a NEP-141 token** ([contracts/usdt](contracts/usdt/src/lib.rs)), replacing the ERC-20 mock.
- **NEAR chain client** ([apps/api/src/near.ts](apps/api/src/near.ts), [vault.ts](apps/api/src/vault.ts)) with typed vault views, replacing viem and the generated ABIs.
- **NEP-366 relayer** ([apps/api/src/meta.ts](apps/api/src/meta.ts), [relayer.ts](apps/api/src/relayer.ts)): user actions become delegate actions that the relayer wraps and pays gas for, with gas budgets in NEAR. This replaces EIP-712 signatures.
- **Privy NEAR wallet signing** ([apps/web/src/lib/near-wallet.ts](apps/web/src/lib/near-wallet.ts)): the browser signs each delegate hash with the user's embedded ed25519 wallet.
- **Events from transaction outcomes** ([apps/api/src/indexer.ts](apps/api/src/indexer.ts)): NEP-297 logs are read from each relayed outcome instead of polling EVM logs.
- **An in-memory NEAR chain for tests** ([apps/api/test/fakeChain.ts](apps/api/test/fakeChain.ts)) that enforces the vault's rules, so the API runs end to end in CI.

## Why onchain stablecoin settlement on NEAR

A balance shared by many companies only works if no one can touch it, including us. A card or bank rail runs on trust in whoever keeps the ledger. It can't stop that party from over-charging a user, issuing credits with nothing behind them, or holding back an app's earnings. The vault can:

- A credit exists only when USDT arrives through `ft_transfer_call`, and `totals()` shows the vault covers every balance, live.
- Only an app's own signer can charge for that app, and only up to the limit the user approved. Kredo's operator account is refused.
- Apps are paid in USDT by the contract itself, with no payout schedule and no chargebacks.

NEAR makes per-use pricing possible. A charge costs a fraction of a cent in gas, so a 1 cent message settles onchain. A card payment costs around 30 cents, so a 1 cent sale is impossible. Named accounts and meta transactions (NEP-366) let the relayer pay gas while every action stays the user's own.

## Live on NEAR testnet

| | |
|---|---|
| Vault | [`vault-v2.kredo-network.testnet`](https://testnet.nearblocks.io/address/vault-v2.kredo-network.testnet) |
| Test USDT (NEP-141, 6 decimals) | [`usdt.kredo-network.testnet`](https://testnet.nearblocks.io/address/usdt.kredo-network.testnet) |
| App signers | sub-accounts of [`apps.kredo-network.testnet`](https://testnet.nearblocks.io/address/apps.kredo-network.testnet), one per app |
| Vault deploy | [`BesTcca…vUAL`](https://testnet.nearblocks.io/txns/BesTccaHC9MdESr9yx5wMKSvrXZDQtnMAU4prjcwvUAL) |
| Test USDT deploy | [`6i6ZaUX…moMeb`](https://testnet.nearblocks.io/txns/6i6ZaUXg4KwtFpn6FQkkQPvfkhvJPDzPEoSB3tYmoMeb) |

What each security rule looks like on chain, from the smoke test after deploying `vault-v2`:

| | Transaction |
|---|---|
| An app's signer account is created with one function-call key | [`56vbreC…D47`](https://testnet.nearblocks.io/txns/56vbreCdTyGs7wWf8k8Hm9CMCPoCP5MaVxuatGY78D47) |
| **App-signed charge**: the relayer pays the gas, and the `charge` receipt comes from the app's signer | [`9m4557D…e7n`](https://testnet.nearblocks.io/txns/9m4557DaNcpKM43pYUJRXK6EuJm6XbjKbZVdveBR7e7n) |
| Hold of 3 credits, then capture of 2, with 1 returned to the user | [`9vQ3buz…Nqc`](https://testnet.nearblocks.io/txns/9vQ3buz2EWRtB8q5jt9UJyZw9Ph1o2fuESLjnm1AWNqc) |
| **Kredo's operator charging directly is refused** with "Not app signer" | [`AgSRAP9…qNv`](https://testnet.nearblocks.io/txns/AgSRAP9rGkiWWV458ayiSSDvoSkUS424G8ptZfAaGqNv) |
| **A send to an unregistered account is refused** with "Recipient not registered" | [`7VEcjsT…yMh`](https://testnet.nearblocks.io/txns/7VEcjsTcYLuvxBcJh6mBSnYVko8Xbxbd4jrY78aH9yMh) |

Addresses and transactions are also in [contracts/deployments/testnet.json](contracts/deployments/testnet.json). The first NEAR vault, [`vault.kredo-network.testnet`](https://testnet.nearblocks.io/address/vault.kredo-network.testnet) (before storage and app signers), is listed there under `previous`.

## How it works

```
 Partner apps                                Hosted pages (apps/web)
   React kit  ── popup ───────────────────►  connect · buy · account · claim
   server + SDK ──┐                                    │ user approves
                  ▼                                    ▼
          ┌──────────────────── API (apps/api) ────────────────────┐
          │ REST · relayer (pays gas, budgets) · indexer · webhooks │
          └───────────────────────────┬────────────────────────────┘
                                      ▼
                  NEAR: Kredo vault holding USDT
          balances · per-app limits · holds · charges · payouts
```

1. **Sign in.** A user signs in with email. Privy makes them an embedded NEAR wallet: an ed25519 key only they can use, whose implicit account holds their balance. Our relayer creates the account onchain with a little NEAR.
2. **Buy.** They send USDT to the vault with `ft_transfer_call`. Our relayer pays the gas.
3. **Connect.** An app asks to connect, and the user approves a spending limit for it.
4. **Spend.** The app charges per use, or holds credits for a long job and captures them when it's done. Each charge splits onchain into the app's earnings and a 5% network fee.
5. **Get paid.** The app withdraws its earnings in USDT whenever it likes.

Every user action (buy, connect, disconnect, send, claim link) is a NEAR meta transaction (NEP-366). The API builds a delegate action for the user's own account, the browser signs its hash with the Privy NEAR wallet, and the relayer wraps it in a transaction and pays the gas. The vault sees the user as the caller, and the relayer can't change what was signed. Charges, holds, captures and refunds work the same way, but are signed by the app: the API prepares a delegate action for the app's signer account, the app's server checks it and signs it with its own key through the SDK, and the relayer pays the gas. Payouts go to the app's own payout account. The vault's NEP-297 events are read straight from each transaction's outcome into activity and webhooks.

## Integrate

```bash
npm install kredo          # server
npm install kredo-react    # buttons and a live balance, optional
```

```ts
import { Credits } from "kredo";
const credits = new Credits({
  apiKey: process.env.CREDITS_API_KEY,
  signerKey: process.env.CREDITS_SIGNER_KEY, // your app's own NEAR key: only it can charge for your app
});

await credits.charge({ user, action: "chat.message", ref: messageId });

const hold = await credits.hold({ user, action: "video.render", quantity: 12 });
try {
  await render(job);
  await credits.capture(hold.holdId);
} catch {
  await credits.release(hold.holdId);
}
```

Companies sign up on the [dashboard](https://kredo-near.vercel.app/dashboard): register an app (the network pays the gas), get live and test keys, set prices, and withdraw USDT. Each app also gets its signer account and `CREDITS_SIGNER_KEY` from `node scripts/create-app-signer.mjs <app id>`, which prints the key once. A test key runs the same calls with fake credits. See [examples/starter](examples/starter/server.ts) for the smallest app, and the [SDK README](packages/sdk/README.md) for every call.

## Security: who can move money

Each app has its own NEAR sub-account, such as `app-39cbd0db321ad08a.apps.kredo-network.testnet` for Parley. It is created with a single **function-call access key** that can call only `charge`, `hold`, `capture`, `release` and `refund` on the vault, with a capped gas allowance, and it never gets a full-access key ([create-app-signer.mjs](scripts/create-app-signer.mjs)). The vault accepts a charge, hold, capture or refund for an app only from that app's signer ([`only_app_signer`](contracts/vault/src/lib.rs)).

| Who | Can | Can't |
|---|---|---|
| Kredo's operator (the relayer) | pay gas, register apps, pause, release holds and cancel claims (both return credits to their owner), trigger a payout to the app's own payout account | charge, hold, capture or refund for any app; change a fee, payout account or signer |
| Kredo's owner account | set an app's fee (at most 20%) and per-charge cap, add or remove operators, unpause, withdraw the network fees | charge, hold, capture or refund for any app; change an app's payout account or signer |
| An app's signer key, if it leaks | charge **that app's** users, up to the limits they approved, into that app's own earnings | touch other apps, move USDT or NEAR, add keys, call anything else |
| An app's payout account | rotate the app's signer with `set_app_signer`, move the payout | — |
| A user | approve, change or revoke each app's limit; send credits; make claim links | — |

The SDK also checks every transaction the API prepares before signing it: the hash matches the bytes, the key is the app's own, and the method, user and ref match the request (and the amount, when the app gives it in credits rather than by action).

**Storage, the NEAR way (NEP-145).** Before an account can hold state in the vault, someone pays its storage with `storage_deposit`. `storage_balance_bounds` and `storage_balance_of` behave as NEP-145 says. Every write that adds state measures the bytes it adds and takes their cost from the storage balance of the account that caused them, or fails with "Insufficient storage", so the vault's own NEAR is never spent on other people's data:

- A USDT deposit for an unregistered user is refunded in full, with no state written. A send or claim to an unregistered account is refused.
- Approvals are paid from the user's storage balance. Charges, holds and refunds are paid from the app signer's (0.5 NEAR, funded once at onboarding).
- The API registers users and recipients from the relayer before the write that needs it, so users never see a storage error.
- `storage_withdraw` and `storage_unregister` are refused, since Kredo pays users' storage and withdrawals would let throwaway accounts drain it.

## Gas and safety

Our relayer pays all gas. Users and companies never hold NEAR or see a gas fee.

**The contract guards the money.** Kredo's keys can't charge, redirect a payout, or refund someone who never paid, and only the owner can change a fee, up to 20%. Apps learn who a user is only through a one-time code, swapped server to server.

**The relayer guards its gas.** Every check runs before sending, so a refused transaction costs nothing.

| Guard | Default |
|---|---|
| Check first | a charge or hold the user can't cover (balance, limit, expiry) is refused before it is sent |
| Gas cap | 300 Tgas per transaction at most |
| Daily budget | a total cap, and a smaller one per app |
| Floor | below a minimum balance, only exits go out: release, revoke, payout |
| Rate limits | 120 writes per minute per key, 20 new accounts per hour per IP |
| Minimum amount | 1 credit, so dust can't burn gas |
| Retries | the same `ref` returns the first result, never a second charge |

## Run it

Needs Node 22, Rust with the `wasm32-unknown-unknown` target and [cargo-near](https://github.com/near/cargo-near), [near-cli-rs](https://github.com/near/near-cli-rs), and `jq`.

**1. Privy.** Create an app at [dashboard.privy.io](https://dashboard.privy.io) with email login, identity tokens on, and NEAR enabled under embedded wallets (extended chains). Each user gets an embedded NEAR wallet on first sign-in, and its implicit account holds their balance.

**2. The relayer key.** The relayer signs every transaction and pays its gas, and must be an operator on the vault. Import its key with near-cli, or set `RELAYER_PRIVATE_KEY`:

```bash
near account import-account using-private-key ed25519:... network-config testnet
```

Keep it funded: each new user costs about 0.014 NEAR (account activation, USDT storage and vault storage), each new app about 0.52 NEAR (its signer account and 0.5 NEAR of vault storage), and each transaction a fraction of a cent. It also holds the test USDT the faucet hands out.

**3. Install and run.**

```bash
git clone https://github.com/chandrabosep/near-hacks-kredo && cd near-hacks-kredo
npm install
cp apps/api/.env.example apps/api/.env       # PRIVY_APP_ID, PRIVY_APP_SECRET
cp apps/web/.env.example apps/web/.env       # NEXT_PUBLIC_PRIVY_APP_ID

npm run contracts:build && npm run contracts:test
npm run dev:local                            # API on :4000, hosted pages on :3000, against the testnet vault
npm run demos:keys                           # registers Parley and Lumen, writes their .env.local
node scripts/create-app-signer.mjs <app id> --env demos/parley/.env.local   # each demo's signer key
npm run dev:parley                           # :3101 (and npm run dev:lumen on :3102)
```

Fund a signed-in account with test USDT: `npm run fund:testnet -- <account> 20`, or use "Get test USDT" on `/buy`. Run the whole money flow through the SDK with `USER_ACCOUNT_ID=you.testnet ADMIN_TOKEN=... npm run e2e -w kredo`.

Tests: `npm run test:api` (end to end against an in-memory NEAR chain with the vault's rules), `npm run test:sdk`, `npm run contracts:test`.

The API reads the vault, USDT and relayer accounts from [contracts/deployments/testnet.json](contracts/deployments/testnet.json) and uses FastNEAR's RPC by default, failing over to dRPC on rate limits or a lagging node (`NEAR_RPC_URL` to change it; NEAR's own `rpc.*.near.org` is deprecated and rate limited).

### Deploy

| Service | Where | Settings |
|---|---|---|
| API | Render, from [render.yaml](render.yaml), with Postgres | `RELAYER_PRIVATE_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `WEB_ORIGINS` (the hosted pages' URL). `NEAR_NETWORK=testnet`, `DATABASE_URL` and `ADMIN_TOKEN` come from the blueprint. |
| Hosted pages | Vercel, root `apps/web` ([vercel.json](apps/web/vercel.json)) | `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_API_URL` (the Render URL). Optional: `NEXT_PUBLIC_NEAR_NETWORK`, `NEXT_PUBLIC_EXPLORER_URL`. |
| Parley, Lumen | Vercel, roots `demos/parley` and `demos/lumen` | `CREDITS_API_KEY`, `CREDITS_API_URL`, `NEXT_PUBLIC_CREDITS_PAGES_URL` (from `API=... ADMIN_TOKEN=... npm run demos:keys`), `CREDITS_SIGNER_KEY` (from `scripts/create-app-signer.mjs`), plus each demo's AI provider keys. |
| Packages | npm | `npm publish -w kredo` and `npm publish -w kredo-react`. |

Every service redeploys on a push to `main`. A database used by an earlier vault is cleared on first start, since its records belong to another vault.

## Repo

| Path | What |
|---|---|
| [contracts](contracts) | The vault and test USDT in Rust (near-sdk), with unit tests |
| [apps/api](apps/api) | REST API, relayer, indexer and webhooks, on Postgres |
| [apps/web](apps/web) | Landing, connect, buy, account, send, claim, dashboard, reserves, docs |
| [packages/sdk](packages/sdk) · [packages/react](packages/react) | `kredo` and `kredo-react` |
| [demos](demos) | Parley and Lumen |
| [examples/starter](examples/starter) | The smallest integration, in one file |
| [docs](docs) | Product overview, plan, design system, pitch |

## Limitations

- Testnet only, and not audited.
- **The vault account still has a full-access key, held by Kredo**, so Kredo could deploy new code. Until that key is removed or put behind a multisig (the mainnet step), "Kredo can't charge anyone" holds for the contract as deployed, not against a code upgrade.
- Parley and Lumen are Kredo's own demos, so their payout account is Kredo's owner account, which can rotate their signers. A company's app pays out to its own account, and only that account can rotate its signer.
- On testnet one account is the owner, and the relayer is the operator. In production the owner would be a multisig.
- Storage isn't refunded when state shrinks (holds closing, claims settling).
- Buying from another chain with NEAR Intents isn't included. NEAR Intents is mainnet-only, and this vault runs on testnet.
- Activity is built from transactions the network sends. A deposit made straight from another NEAR wallet shows in balances, not in activity.
- Users can't cash credits out to USDT. They can send them or share a claim link. Only apps are paid out.
- One charge per transaction, with no batching yet.
- Payout accounts can't be changed from the dashboard yet. The contract supports it.
- Test mode balances live in memory and reset when the API restarts.
- Each new account gets 0.5 test USDT once, from a small faucet with a daily cap.

## Built with

**Libraries and services.**

| Where | What |
|---|---|
| Contracts | [near-sdk](https://github.com/near/near-sdk-rs), [near-contract-standards](https://github.com/near/near-sdk-rs/tree/master/near-contract-standards) (NEP-141), [cargo-near](https://github.com/near/cargo-near) |
| API | [near-api-js](https://github.com/near/near-api-js), Express, Drizzle ORM on Postgres (PGlite in tests), Zod, `@privy-io/node` |
| Hosted pages | Next.js, React, `@privy-io/react-auth` (embedded NEAR wallets), shadcn/ui on Base UI, Tailwind, MDX with Shiki for the docs, `@noble/curves` and `@scure/base` for ed25519 and base58 |
| Demos | Next.js; Parley uses the Anthropic SDK |
| Infrastructure | FastNEAR RPC, NearBlocks, Privy, Vercel, Render |

**AI-assisted code.** Most of the code in this repo, on both the EVM build and the NEAR port, was written with [Claude Code](https://claude.com/claude-code) (Claude Opus) working under my direction: I set the design, reviewed the changes, and ran and tested them. 56 of the 85 EVM-build commits and every NEAR-port commit carry a `Co-Authored-By: Claude` trailer.

## License

[MIT](LICENSE)
