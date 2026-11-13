#!/usr/bin/env bash
# Mints test USDT to a NEAR testnet account, so it can buy credits on /buy.
# Signs as the test USDT's owner with near-cli (its key in ~/.near-credentials).
#
#   npm run fund:testnet -- <account> 50      # 50 USDT (default 20)
set -euo pipefail
cd "$(dirname "$0")/.."
TO=${1:?usage: fund-testnet.sh <account> [usdt]}
USDT_AMOUNT=${2:-20}
USDT=$(jq -r .usdt contracts/deployments/testnet.json)
OWNER=${OWNER:-$(jq -r .owner contracts/deployments/testnet.json)}

near contract call-function as-transaction "$USDT" mint \
  json-args "{\"account_id\":\"$TO\",\"amount\":\"$((USDT_AMOUNT * 1000000))\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as "$OWNER" network-config testnet sign-with-legacy-keychain send >/dev/null
echo "minted $USDT_AMOUNT test USDT to $TO"
