# Universal Credits

Buy credits once, in any partner app, and spend the leftover in every other one. Each company is paid in USDT for what its users spend. Credits are backed 1:1 by USDT held in the `CreditVault` contract on Whitechain.

## Live on Whitechain Sepolia (chain ID 1874)

| | |
|---|---|
| CreditVault (verified) | [`0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A`](https://explorer.testnet.whitechain.io/address/0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A) |
| USDT (official test token) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| First USDT deposit | [`0xf20b354c…6d82`](https://explorer.testnet.whitechain.io/tx/0xf20b354ccfb7465566e89fcbd1836da436cf3ff46f45d1f977d73140178d6982) |

## Why onchain settlement

A normal payment rail can't stop the operator from over-charging a user or issuing credits that aren't backed. The vault does: every credit exists only because USDT arrived, every charge stays inside a limit the user signed, and `checkBacking()` proves the vault's USDT covers every balance at any moment.
