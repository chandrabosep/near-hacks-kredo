# Whitechain feedback

What building Kredo on Whitechain Sepolia was like at ETHGlobal Mumbai.

## What worked

- **Plain EVM, no surprises.** Foundry, viem and OpenZeppelin worked unchanged. viem ships `whitechainSepolia`, and its OP Stack support returns the L1 data fee, so we never wrote fee math by hand.
- **The test USDT is built for gasless flows.** It supports both EIP-2612 `permit` and EIP-3009 `receiveWithAuthorization`, so users deposit with a signature and our relayer pays the gas.
- **Fees are tiny.** A charge is about 95,000 gas, about 0.00047 WBT at the 5 gwei floor. That made one onchain transaction per 1 cent charge realistic.
- **Verification on Blockscout** worked from `forge script --verify` once the verifier URL was right.
- **Docs for agents.** `llms.txt`, `llms-full.txt`, Markdown versions of every page and the `whitechain-dev` skill saved us a lot of searching.

## Where we got stuck

- **Test USDT.** There is no USDT faucet, so we had to get tokens from the booth. Our app gives each new user a small amount from our own wallet, which needs a stock we can't top up ourselves.
- **WBT faucet limits.** 0.5 WBT per 24 hours per GitHub account, address and IP. On shared event WiFi one claim can block the whole team, and the GitHub account must be at least 30 days old.
- **Verifier URL.** It must end in `/api/` with the trailing slash, which is easy to miss.
- **RPC rate limit.** 50 requests per second per IP is fine for an app but tight for an indexer catching up from the deploy block. We batch RPC calls, read logs in fixed block chunks and retry on failure.
- **Embedded wallets.** Reown's embedded wallet doesn't support Whitechain: login succeeds, then signing fails. We used Privy embedded wallets instead.

## What the docs were missing

- A page for the test USDT: its EIP-712 domain (`Tether USD`, version `1`), that it supports `permit` and `receiveWithAuthorization`, and that `receiveWithAuthorization` requires `to` to be `msg.sender`. We read this from the verified implementation.
- A gasless payment example: a relayer submitting a permit deposit, with how to fund it and limit what it spends.
- Which embedded wallet and account abstraction providers support chain 1874 today.
- Indexing guidance: recommended block ranges for `eth_getLogs` and how the rate limit counts batch requests.
