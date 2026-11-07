# Contracts

`CreditVault` holds the USDT behind every credit, and every balance, app limit, hold, claim link and payout.

## Deployed

| | |
|---|---|
| Network | Whitechain Sepolia, chain ID 1874 |
| CreditVault | [`0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A`](https://explorer.testnet.whitechain.io/address/0xaaA19C7160FDe7532F5f4Fbd698b549A884c664A?tab=contract), verified (Solidity 0.8.30) |
| USDT | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7), official test token |
| Deploy block | 12322125 |
| Owner and operator | [`0xA81acADf1D474d14B98b0499E727ebdB1600e3EF`](https://explorer.testnet.whitechain.io/address/0xA81acADf1D474d14B98b0499E727ebdB1600e3EF) |

Also in [deployments/1874.json](deployments/1874.json). Payment transactions are in the [main README](../README.md#onchain-proof).

## Backing

1 credit = $0.01 = 10,000 USDT units (6 decimals). Credits exist only when USDT arrives. There is no admin mint and the USDT is never lent out.

```
usdt.balanceOf(vault) == balances + held + claims + earnings + fees
```

`checkBacking()` proves it live. USDT sent outside a deposit counts as surplus, never as credits.

## Who can do what

| Action | Who | Guard |
|---|---|---|
| `deposit`, `depositWithPermit`, `depositWithAuthorization` | Anyone, with the user's signature | Credits go to the signer, exactly what arrived |
| `approveApp`, `revokeApp` | The user, or their EIP-712 signature | Revoke works while paused |
| `charge`, `hold`, `capture` | Operator | Never above the user's limit for that app |
| `release` | Operator, or anyone after expiry | Holds last at most 1 day |
| `refund` | Operator | Capped at what that user spent with that app |
| `send`, `createClaim`, `claim` | The user, or the link holder | A claim can't be redirected |
| `payout` | App payout address, operator or owner | USDT always goes to the app's payout address |
| `registerApp`, `setAppActive` | Owner or operator | |
| `setAppPayout` | App payout address or owner | Never the operator |
| `setAppTerms`, `setOperator`, `unpause` | Owner | Fee capped at 20%. Ownership is two-step |
| `pause` | Owner or operator | Exits stay open: revoke, release, cancel claim, payout |

**A leaked operator key can't drain anyone.** It can't charge above a signed limit, redirect a payout, raise a fee, refund an account that never paid, or hold credits for more than a day.

**Retries are safe.** Every charge, hold and refund carries a `ref` unique per app, so a retry never charges twice. Signatures use EIP-712 with single-use random nonces, and work with EOA and ERC-1271 wallets.

## Build and test

```bash
git submodule update --init --recursive
forge build
forge test                                    # unit, fuzz and invariant
FOUNDRY_PROFILE=deep forge test               # longer campaigns
FORK=1 forge test --match-path "test/fork/*"  # against the real Whitechain USDT
```

The invariant suite runs random sequences of every action and checks that the vault's USDT equals its liabilities to the unit.

## Deploy

```bash
# Local, with MockUSDT
anvil
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Whitechain Sepolia, official USDT only (the script refuses any other token)
cp .env.example .env    # set OPERATOR and FEE_RECIPIENT
cast wallet import deployer --interactive
forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --account deployer --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
```

Each run writes `deployments/<chainId>.json`, which the API reads.

## Limitations

- Testnet only, not audited, not upgradeable.
- One key is owner, operator and fee recipient on testnet. In production the owner would be a multisig.
- Users can't cash out to USDT. Only apps are paid out.
- One charge per transaction, no batching yet.
