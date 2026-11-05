# Whitechain: developer reference

Everything we need to build on Whitechain Sepolia, in one place. Pulled from the official docs on 5 Nov 2026. When something here looks stale, fetch the live page: append `.md` to any docs URL, or read the full index at https://docs.whitechain.io/llms.txt.

Product context is in [overview.md](overview.md). The build plan is in [plan.md](plan.md). The test USDT details live in plan.md section 3a.

---

## 1. Network

Whitechain is an OP Stack L2. Mainnet settles on Ethereum, Sepolia settles on Ethereum Sepolia. WBT is the native gas token on both, with 18 decimals.

| | Whitechain Sepolia (we use this) | Whitechain Mainnet |
|---|---|---|
| Chain ID | `1874` (hex `0x752`) | `1875` (hex `0x753`) |
| L1 | Ethereum Sepolia (`11155111`) | Ethereum mainnet (`1`) |
| RPC | `https://rpc.testnet.whitechain.io` | `https://rpc.whitechain.io` |
| WebSocket | `wss://rpc.testnet.whitechain.io/ws` | `wss://rpc.whitechain.io/ws` |
| Explorer (Blockscout) | https://explorer.testnet.whitechain.io | https://explorer.whitechain.io |
| Explorer API docs | https://explorer.testnet.whitechain.io/api-docs | https://explorer.whitechain.io/api-docs |
| Faucet | https://faucet.testnet.whitechain.io | none |
| Bridge | https://bridge.testnet.whitechain.io | Portal bridge |
| Block time | 1s | 1s |
| Min base fee | 5 gwei | 5 gwei |
| EVM version | Prague (set `evm_version = "prague"`) | Prague plus a Karst subset |
| Per-tx gas cap | none | 16,777,216 |
| L2 block gas limit | 40,000,000 | 40,000,000 |
| Status page | https://status.whitechain.io | same |

No API key and no allowlist on any endpoint. No third party RPC exists yet, so do not trust any other endpoint claiming chain 1874.

Both viem and Reown ship the chain. `import { whitechainSepolia } from 'viem/chains'` works with no custom definition.

### Predeploys (exist at block 0)

| Contract | Address | Use |
|---|---|---|
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | Batch reads into one `eth_call`. viem uses it automatically. |
| GasPriceOracle | `0x420000000000000000000000000000000000000F` | `getL1Fee(bytes unsignedTx)` returns the L1 data fee. |

---

## 2. RPC rate limits (matters for the relayer and the reserves page)

| Property | Value |
|---|---|
| Sustained | 50 requests/s per client IP |
| Burst | up to 500 requests above sustained |
| Counted | each HTTP request, not each call in a batch |
| Batch size | up to 100 JSON-RPC calls per request |
| When limited | `429 Too Many Requests` with `Retry-After: 1` |

Rules for our backend:
- Batch reads through Multicall3 or JSON-RPC batches. 20 reads in one request cost 1 against the limit.
- Use `eth_subscribe` on `newHeads` or `logs` over one WebSocket instead of polling `eth_blockNumber`.
- Cache receipts and finalized blocks.
- On `429`, back off exponentially starting from `Retry-After`. Immediate retries keep failing.
- The Blockscout API is also rate limited per IP. Same rules.

---

## 3. Gas and fees

- Every fee is paid in WBT. Our relayer wallet holds WBT; users and companies never do.
- Fee = L2 execution fee (gas used × gas price) + L1 data fee (tx size × Ethereum prices).
- Base fee floor is 5 gwei. A plain transfer is 21,000 gas, about 0.000105 WBT. A small contract deploy is about 0.0006 WBT.
- The L1 data fee is charged on every tx and is not bounded by the gas limit. On testnet it is tiny.
- Failed transactions still pay both parts.
- Let viem estimate fees. It has OP Stack support and returns the L1 fee. Do not hand-roll the formula.

### Faucet

- https://faucet.testnet.whitechain.io, sign in with GitHub (account at least 30 days old).
- 0.5 WBT per rolling 24h per GitHub account, per address, and per IP. A shared office or VPN IP can block a claim.
- No USDT faucet. Test USDT comes from the Whitechain booth.
- For more WBT than the daily drip, ask the team through the support channels. For the hackathon, every teammate should claim once a day into the relayer wallet.

---

## 4. Finality

| Stage | Meaning | Time |
|---|---|---|
| Soft confirmation | In an L2 block, on the sequencer's word | about 1s |
| Safe | Batch posted and confirmed on Ethereum | up to about 30 min |
| Finalized | Ethereum finality reached, irreversible | about 13 min after the batch lands |

For our UX: treat the soft confirmation as "done" in the app and the receipt as the proof. Withdrawals to L1 take about an hour on testnet and 7 days on mainnet, but we never withdraw to L1. Flashblocks are not enabled.

---

## 5. Foundry: deploy and verify

Pin the compiler and EVM in `foundry.toml`. Verification fails if the compiler differs from what built the bytecode.

```toml
[profile.default]
solc = "0.8.30"
evm_version = "prague"

[rpc_endpoints]
whitechain_sepolia = "https://rpc.testnet.whitechain.io"
```

Deploy. Without `--broadcast`, forge only simulates.

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url whitechain_sepolia \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Verify on Blockscout. The verifier URL must end in `/api/`.

```bash
forge verify-contract <address> src/CreditVault.sol:CreditVault \
  --rpc-url whitechain_sepolia \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.whitechain.io/api/
```

Or verify during deploy by adding `--verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` to the script command.

Safer key handling: `cast wallet import relayer --interactive` then pass `--account relayer` instead of `--private-key`.

### Proxy contracts (if CreditVault becomes upgradeable)

- Verify the implementation like a normal contract.
- Verify the proxy with its constructor args: `--constructor-args $(cast abi-encode "constructor(address,bytes)" <impl> <init_calldata>)`. Keep the initializer calldata from deploy time, you cannot verify without it.
- Confirm with the API, not the page: `curl https://explorer.testnet.whitechain.io/api/v2/smart-contracts/<proxy>` must show `is_fully_verified: true`, `proxy_type: eip1967`, and `implementations` filled in.
- Blockscout labels UUPS proxies "Transparent Proxy". Cosmetic.
- Hardhat needs `--force` on the proxy verify, or it silently skips.

Ready-made templates: https://github.com/whitechain-labs/templates (Foundry and Hardhat folders). `npx degit whitechain-labs/templates/Foundry <dir>` clones one.

---

## 6. viem

```ts
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { whitechainSepolia } from 'viem/chains'

export const publicClient = createPublicClient({ chain: whitechainSepolia, transport: http() })

const account = privateKeyToAccount(process.env.RELAYER_KEY as `0x${string}`)
export const walletClient = createWalletClient({ account, chain: whitechainSepolia, transport: http() })
```

- `http()` with no URL uses the official RPC. Pass a URL to override.
- `publicClient.multicall({ contracts: [...] })` batches reads through Multicall3 automatically.
- Keep `as const` on ABIs for type inference.
- For a WebSocket transport use `webSocket('wss://rpc.testnet.whitechain.io/ws')` and `watchContractEvent` for live charges on the wallet and reserves pages.

### Reown AppKit (if we ever add an external wallet connect)

- Import `whitechainSepolia` from `@reown/appkit/networks`. Connect, sign and transact work.
- Set `features: { email: false, socials: false }`. Reown's embedded wallet does not support Whitechain, so login succeeds and signing fails.
- Not available: ENS resolution, swaps, on-ramp, account transaction history. Read history from the explorer API instead.
- Next with Turbopack can fail the build on unused wallet SDK peer deps. Alias them to an empty module with `resolveAlias`.

We do not plan to use this. Our users log in with email and the relayer signs. Noted in case a judge asks for a wallet view.

---

## 7. Blockscout explorer API (for the wallet, reserves page, and README links)

Base URLs on Sepolia:

| Surface | Base | Use |
|---|---|---|
| REST v2 | `https://explorer.testnet.whitechain.io/api/v2` | Decoded JSON: addresses, txs, tokens, logs, verified contracts |
| ETH JSON-RPC | `https://explorer.testnet.whitechain.io/api/eth-rpc` | Standard `eth_` methods |
| Etherscan-style | `https://explorer.testnet.whitechain.io/api?module=...&action=...` | Legacy tooling |
| GraphQL | see api-docs | Pick exact fields |

Useful endpoints:

```
GET /api/v2/addresses/{hash}                     address summary
GET /api/v2/addresses/{hash}/token-balances      USDT and other token holdings
GET /api/v2/addresses/{hash}/transactions        tx history, paginated with block_number and index
GET /api/v2/addresses/{hash}/token-transfers     ERC-20 transfers in and out
GET /api/v2/transactions/{hash}                  one tx, with status and decoded input
GET /api/v2/transactions/{hash}/logs             decoded events
GET /api/v2/smart-contracts/{address}            verification state
GET /api/v2/tokens/{address}                     token metadata and holder count
```

Send `accept: application/json`. Public, read-only, no key, rate limited per IP.

Link formats for the README and the UI:

```
https://explorer.testnet.whitechain.io/tx/<hash>
https://explorer.testnet.whitechain.io/address/<address>
https://explorer.testnet.whitechain.io/token/<address>
```

---

## 8. Judging checklist that depends on this page

From plan.md section 3b. Each item maps to something above.

- Contracts deployed on 1874 and verified on Blockscout: section 5.
- One real USDT payment settled onchain, explorer tx link in the README: section 7 link format. Self-minted tokens do not count. Use the official test USDT from plan.md 3a.
- Video shows the relayer's gas view: show the relayer address on the explorer and its WBT balance dropping per charge. Section 3 explains the fee parts if asked.
- Feedback doc for Whitechain: log anything from sections 2, 3, 5, or 7 that bites us (429s, faucet IP limit, verify URL suffix, proxy label).

---

## 9. Docs for AI agents

The docs are published for agents. Use these when a future session needs more than this page.

| Resource | URL |
|---|---|
| Page index | https://docs.whitechain.io/llms.txt |
| Every page in one file (366 KB) | https://docs.whitechain.io/llms-full.txt |
| Any page as Markdown | append `.md` to the URL, e.g. https://docs.whitechain.io/learn/network/reference.md |
| Agent skill source | https://github.com/whitechain-labs/skills (folder `whitechain-dev`) |
| Templates | https://github.com/whitechain-labs/templates |
| OpenAPI | https://docs.whitechain.io/api-reference/openapi.json |

Install the agent skill with:

```bash
npx skills add whitechain-labs/skills --skill whitechain-dev
```

A copy of the skill is also in [.claude/skills/whitechain-dev/](../.claude/skills/whitechain-dev/) so Claude Code loads it without the install step. The skill covers connect, inspect, deploy, verify, faucet, and run a node. It does not cover token transfers, permits, or bridging, which is why this page exists.

Pages most likely to matter later:

| Topic | URL |
|---|---|
| Network reference, admin addresses, predeploys | https://docs.whitechain.io/learn/network/reference.md |
| Sepolia parameters, dispute game timings | https://docs.whitechain.io/learn/network/testnet.md |
| Fees | https://docs.whitechain.io/learn/network/network-fees.md |
| Finality | https://docs.whitechain.io/learn/network/transaction-finality.md |
| Faucet | https://docs.whitechain.io/learn/get-started/get-testnet-wbt.md |
| Foundry | https://docs.whitechain.io/build/deploy/deploy-with-foundry.md |
| Hardhat | https://docs.whitechain.io/build/deploy/deploy-with-hardhat.md |
| Proxy verification | https://docs.whitechain.io/build/deploy/verify-proxy-contracts.md |
| viem | https://docs.whitechain.io/build/dapps/use-viem.md |
| Reown AppKit gotchas | https://docs.whitechain.io/build/dapps/connect-wallet-with-reown.md |
| Next template | https://docs.whitechain.io/build/dapps/dapp-with-nextjs.md |
| Explorer API overview | https://docs.whitechain.io/build/block-explorer/overview.md |
| Wallet indexing example (REST v2 + RPC) | https://docs.whitechain.io/build/block-explorer/indexer-wallet.md |
| Token dashboard example (GraphQL) | https://docs.whitechain.io/build/block-explorer/indexer-token-dashboard.md |
| Gas tracker example | https://docs.whitechain.io/build/block-explorer/indexer-gas-tracker.md |
| Token list | https://docs.whitechain.io/build/block-explorer/token-list.md |
| Portal bridge (USDT, USDC, WBT, ETH) | https://docs.whitechain.io/build/bridge/portal-bridge.md |
| Canonical bridge | https://docs.whitechain.io/build/bridge/bridge-assets.md |
| FAQ | https://docs.whitechain.io/learn/general/faq.md |
