# Kredo

**One balance. Every app.** Users fund one balance and spend it in any app on the network. Apps charge per use and are paid in USDT. Every credit is backed 1:1 by USDT in a vault contract on NEAR.

| | |
|---|---|
| App | [kredo-near.vercel.app](https://kredo-near.vercel.app) · [docs](https://kredo-near.vercel.app/docs) |
| Demo apps | [Parley](https://kredo-near-parley.vercel.app) (AI chat) · [Lumen](https://kredo-near-lumen.vercel.app) (AI images) |
| API | [kredo-near-api.onrender.com/v1/health](https://kredo-near-api.onrender.com/v1/health) |
| Packages | [`kredo`](https://www.npmjs.com/package/kredo) · [`kredo-react`](https://www.npmjs.com/package/kredo-react) |
| Demo video | link to be added |

## What NEAR gives it

- **Apps sign their own charges.** Each app has a sub-account (`<app id>.apps.kredo-network.testnet`) with one function-call key that can only call `charge`, `hold`, `capture`, `release` and `refund` on the vault. The vault accepts charges from no one else, so Kredo itself can't charge anyone.
- **No gas for anyone.** Users and apps sign NEP-366 delegate actions; the relayer wraps them and pays. It can't change what was signed.
- **Storage paid by whoever adds it (NEP-145).** Accounts register with `storage_deposit`, and every write charges its bytes to the account that caused them. A deposit to an unregistered account is refunded in full.
- **Buy from any chain (NEAR Intents).** Pay with USDC on Base, ETH, SOL or BTC; 1Click swaps it into USDT and delivers it to the vault for the user. On testnet this is a preview with live prices and nothing to pay, because NEAR Intents is mainnet-only.
- **Per-use pricing.** A charge costs a fraction of a cent in gas, so a 1-credit ($0.01) message settles on chain.

## On chain (testnet)

Vault [`vault-v2.kredo-network.testnet`](https://testnet.nearblocks.io/address/vault-v2.kredo-network.testnet) · test USDT [`usdt.kredo-network.testnet`](https://testnet.nearblocks.io/address/usdt.kredo-network.testnet) · all addresses in [contracts/deployments/testnet.json](contracts/deployments/testnet.json).

| | Transaction |
|---|---|
| Vault deployed | [`BesTcca…vUAL`](https://testnet.nearblocks.io/txns/BesTccaHC9MdESr9yx5wMKSvrXZDQtnMAU4prjcwvUAL) |
| App signer created with one function-call key | [`56vbreC…D47`](https://testnet.nearblocks.io/txns/56vbreCdTyGs7wWf8k8Hm9CMCPoCP5MaVxuatGY78D47) |
| App-signed charge (relayer pays gas, receipt from the app's signer) | [`9m4557D…e7n`](https://testnet.nearblocks.io/txns/9m4557DaNcpKM43pYUJRXK6EuJm6XbjKbZVdveBR7e7n) |
| Hold 3 credits, capture 2, return 1 | [`9vQ3buz…Nqc`](https://testnet.nearblocks.io/txns/9vQ3buz2EWRtB8q5jt9UJyZw9Ph1o2fuESLjnm1AWNqc) |
| **Kredo's operator charging: refused** ("Not app signer") | [`AgSRAP9…qNv`](https://testnet.nearblocks.io/txns/AgSRAP9rGkiWWV458ayiSSDvoSkUS424G8ptZfAaGqNv) |
| **Send to an unregistered account: refused** | [`7VEcjsT…yMh`](https://testnet.nearblocks.io/txns/7VEcjsTcYLuvxBcJh6mBSnYVko8Xbxbd4jrY78aH9yMh) |

## Who can move money

| Who | Can | Can't |
|---|---|---|
| Kredo's operator (relayer) | pay gas, register apps, pause, release holds | charge, refund, change fees, payouts or signers |
| Kredo's owner | set an app's fee (max 20%), manage operators, withdraw network fees | charge, change an app's payout or signer |
| An app's signer key, if leaked | charge that app's users, within the limits they approved | touch other apps, move USDT or NEAR, add keys |
| An app's payout account | rotate the signer (`set_app_signer`), move the payout | — |

The SDK also checks each prepared transaction before signing: hash, key, method, user and ref.

## Integrate

```ts
import { Credits } from "kredo";

const credits = new Credits({
  apiKey: process.env.CREDITS_API_KEY,
  signerKey: process.env.CREDITS_SIGNER_KEY, // your app's NEAR key: only it can charge for your app
});

await credits.charge({ user, action: "chat.message", ref: messageId });
```

Register an app on the [dashboard](https://kredo-near.vercel.app/dashboard). Full API in the [docs](https://kredo-near.vercel.app/docs) and the [SDK README](packages/sdk/README.md); the smallest app is [examples/starter](examples/starter/server.ts).

## Run it

Needs Node 22, Rust with `cargo-near`, `near-cli-rs` and `jq`, plus a [Privy](https://dashboard.privy.io) app with email login and NEAR embedded wallets.

```bash
npm install
cp apps/api/.env.example apps/api/.env    # PRIVY_APP_ID, PRIVY_APP_SECRET, RELAYER_PRIVATE_KEY
cp apps/web/.env.example apps/web/.env    # NEXT_PUBLIC_PRIVY_APP_ID
npm run contracts:build && npm run contracts:test
npm run dev:local                         # API :4000, app :3000, against the testnet vault
npm run test:api && npm run test:sdk      # end to end against an in-memory NEAR chain
```

Demos: `npm run demos:keys`, then `node scripts/create-app-signer.mjs <app id> --env demos/parley/.env.local`, then `npm run dev:parley`. Deploy settings are in [render.yaml](render.yaml) and each app's `.env.example`. Mainnet vault and a real cross-chain buy: `npm run deploy:mainnet`, then `npm run intents:buy` (written, not yet run).

| Path | What |
|---|---|
| [contracts](contracts) | Vault and test USDT in Rust, 61 unit tests |
| [apps/api](apps/api) | REST API, relayer, indexer, webhooks, NEAR Intents |
| [apps/web](apps/web) | Landing, buy, connect, account, dashboard, reserves, docs |
| [packages](packages) | `kredo` (server SDK) and `kredo-react` |
| [demos](demos) · [examples](examples) | Parley, Lumen and the starter app |

## Limitations

- Testnet only, not audited.
- Kredo still holds the vault account's full-access key, so it could deploy new code. Removing it or putting it behind a multisig is the mainnet step.
- Parley and Lumen pay out to Kredo's owner account, so Kredo can rotate their signers. A real company's app pays out to its own account.
- NEAR Intents is a preview on testnet; the mainnet path hasn't been run.
- Users can't cash credits out to USDT; only apps are paid out. Storage isn't refunded when state shrinks.

## Provenance

Kredo was first built at **ETHGlobal Mumbai** (5–7 Nov 2026) on Whitechain, an EVM chain, with a Solidity vault ([kredo-omega.vercel.app](https://kredo-omega.vercel.app), `kredo@0.1.x` on npm). It was ported to NEAR for this hackathon. The history keeps the two apart: the EVM build's 85 commits end at tag [`ethglobal-final`](https://github.com/chandrabosep/near-hacks-kredo/tree/ethglobal-final); everything after is NEAR work, committed 13 Nov, with the landing page, docs, Intents merge and README on 14 Nov.

| | |
|---|---|
| This submission | tag [`hackathon-final`](https://github.com/chandrabosep/near-hacks-kredo/tree/hackathon-final) |
| Everything the port changed | [`ethglobal-final...hackathon-final`](https://github.com/chandrabosep/near-hacks-kredo/compare/ethglobal-final...hackathon-final) |
| First cut of the port (v1 vault, 13 Nov 18:11) | tag [`hackathon-submission`](https://github.com/chandrabosep/near-hacks-kredo/tree/hackathon-submission) |

New for NEAR: the vault rewritten in Rust, NEP-141 test USDT, app signers, NEP-145 storage, the NEP-366 relayer, Privy NEAR wallet signing, events read from transaction outcomes, NEAR Intents, and an in-memory NEAR chain for tests. The hosted pages, dashboard, SDK surface and demos were carried over and adapted.

**Built with** near-sdk, near-api-js, NEAR Intents 1Click, FastNEAR and dRPC, NearBlocks, Next.js, Express, Drizzle on Postgres, Privy, Vercel and Render.

**AI-assisted.** Most of the code was written with [Claude Code](https://claude.com/claude-code) under my direction: I set the design, reviewed the changes, and ran and tested them. 56 of the 85 EVM commits and every NEAR commit carry a `Co-Authored-By: Claude` trailer.

[MIT](LICENSE)
