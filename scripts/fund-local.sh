#!/usr/bin/env bash
# Mints mock USDT to a wallet on the local chain, so it can buy credits on /buy.
#
#   npm run fund:local -- 0xYourAddress 50      # 50 USDT (default 20)
set -euo pipefail
cd "$(dirname "$0")/.."
TO=${1:?usage: fund-local.sh <address> [usdt]}
USDT_AMOUNT=${2:-20}
USDT=$(jq -r .usdt contracts/deployments/31337.json)
KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
cast send "$USDT" "mint(address,uint256)" "$TO" "$((USDT_AMOUNT * 1000000))" --private-key "$KEY" --rpc-url http://127.0.0.1:8545 >/dev/null
echo "minted $USDT_AMOUNT test USDT to $TO"
