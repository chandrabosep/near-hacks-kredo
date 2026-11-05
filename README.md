# Universal Credits

Buy credits once, in any partner app, and spend the leftover in every other one. Each company is paid in USDT for what its users spend. Credits are backed 1:1 by USDT held in the `CreditVault` contract on Whitechain.

## Live on Whitechain Sepolia (chain ID 1874)

| | |
|---|---|
| CreditVault (verified) | [`0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A`](https://explorer.testnet.whitechain.io/address/0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A) |
| USDT (official test token) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| User deposits 1 USDT (100 credits) | [`0xf20b354c…6d82`](https://explorer.testnet.whitechain.io/tx/0xf20b354ccfb7465566e89fcbd1836da436cf3ff46f45d1f977d73140178d6982) |
| App charges 10 credits through the API | [`0x4207f194…522e`](https://explorer.testnet.whitechain.io/tx/0x4207f194aa90de955282acf10e71350b48b102f48930e0253ab0820675c6522e) |
| App is paid out 0.1425 USDT | [`0xf69cd025…ae50`](https://explorer.testnet.whitechain.io/tx/0xf69cd025c9a3c49414df0a39c48f8cc0743af07ca80b68f642cf684a9cf1ae50) |

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
| Retried requests | the same `ref` returns the first result, never a second charge |

`GET /v1/admin/ops` shows the relayer's balance, today's spend against the budget, and days of runway.

## Why onchain settlement

A normal payment rail can't stop the operator from over-charging a user or issuing credits that aren't backed. The vault does: every credit exists only because USDT arrived, every charge stays inside a limit the user signed, and `checkBacking()` proves the vault's USDT covers every balance at any moment.
