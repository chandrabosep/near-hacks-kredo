# Contracts

`CreditVault` holds the USDT behind every credit, and every balance, app limit, hold, claim link and payout. It runs on Whitechain Sepolia (chain ID 1874) against the official test USDT.

## Units

- 1 credit = $0.01 = **10,000 USDT units** (USDT has 6 decimals).
- Every amount in the contract is in USDT units. Divide by 10,000 only for display.

## Backing

Credits are created only when USDT arrives in the vault. There is no admin mint, and the USDT is never lent out.

```
usdt.balanceOf(vault) == totalBalances + totalHeld + totalClaims + totalEarnings + protocolFees
```

`checkBacking()` returns `(backed, held, owed)` live. USDT sent to the vault outside a deposit shows up as surplus, never as credits.

## Who can do what

| Action | Who | Guard |
|---|---|---|
| `deposit` | Anyone, for any user | Credits exactly the USDT that arrived |
| `depositWithPermit`, `depositWithAuthorization` | Anyone, with the user's signature | Credits always go to the signer |
| `approveApp`, `revokeApp` | The user, or anyone with their EIP-712 signature | Revoke works while paused |
| `charge`, `hold`, `capture` | Operator | Never above the limit the user signed for that app |
| `release` | Operator any time, anyone after expiry | Works while paused. Holds last at most 1 day |
| `refund` | Operator | Capped at what that user spent with that app |
| `send`, `createClaim` | The user, or anyone with their signature | |
| `claim` | Anyone holding the link | The link's key signs the recipient, so it can't be redirected |
| `cancelClaim` | Creator or operator any time, anyone after expiry | Credits always return to the creator |
| `payout` | The app's payout address, operator or owner | USDT always goes to the app's payout address. Works while paused |
| `registerApp`, `setAppActive` | Owner or operator | |
| `setAppTerms` (fee, per-charge cap) | Owner | Fee capped at 20% |
| `setAppPayout` | The app's current payout address, or owner | Never an operator |
| `pause` | Owner or operator | Exits stay open: revoke, release, cancel claim, payout |
| `unpause`, `setOperator`, `withdrawFees` | Owner | Ownership is two-step and can't be renounced |

A leaked operator key can't drain anyone. It can't charge above a signed limit, redirect a payout, raise a fee, refund to an account that never paid, or keep credits held for more than a day.

## Retries and signatures

- Charges, holds and refunds carry a `ref` that must be unique per app, so a retried transaction never charges twice. A hold's id is `keccak256(abi.encode(app, ref))`, known before the transaction lands.
- User signatures use the EIP-712 domain `CreditVault` / `1` with random single-use nonces, so the relayer can submit them in any order. EOA and ERC-1271 wallets both work.
- A limit has a version that bumps on every approve and revoke. Credits returned from a hold go back to the limit only if it is the same version, so a revoked app never regains a limit.

## Setup and tests

```bash
git submodule update --init --recursive
forge build
forge test                                    # unit, fuzz and invariant tests
FOUNDRY_PROFILE=deep forge test               # longer fuzz and invariant campaigns
FORK=1 forge test --match-path "test/fork/*"  # against the real Whitechain test USDT
```

The invariant suite runs random sequences of every action and checks that the vault's USDT equals its liabilities to the unit, that USDT is conserved, and that every running total matches its parts.

## Deploy

Locally, the script also deploys `MockUSDT`:

```bash
anvil
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

On Whitechain Sepolia the script always uses the official test USDT (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) and refuses any other token:

```bash
cp .env.example .env    # set OPERATOR and FEE_RECIPIENT
cast wallet import deployer --interactive
forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --account deployer --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
```

Each run writes `deployments/<chainId>.json` with the vault, USDT, roles and deploy block. The backend reads it.

## Current limitations

- One vault per deployment, not upgradeable. A fix means a new deployment.
- Users can't cash credits out to USDT. Only registered apps are paid out.
- Charges are one per transaction. No batching yet.
- `MockUSDT` is for local tests only and must never be deployed to Whitechain.
