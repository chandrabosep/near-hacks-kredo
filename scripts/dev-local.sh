#!/usr/bin/env bash
# Everything on a local chain: anvil, a fresh deploy, the API and the hosted pages.
#
#   npm run dev:local
#
# Then open http://localhost:3000 for the hosted pages.
# Fund a signed-in user with: npm run fund:local -- <address> [usdt]
set -euo pipefail
cd "$(dirname "$0")/.."

ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RPC=http://127.0.0.1:8545
LOGS=.logs
mkdir -p "$LOGS"

# Stop everything this script started when it exits.
trap 'kill $(jobs -p) 2>/dev/null' EXIT

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "starting anvil"
  anvil --silent >"$LOGS/anvil.log" 2>&1 &
  for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
fi

echo "deploying contracts"
(cd contracts && forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$ANVIL_KEY" >"../$LOGS/deploy.log" 2>&1)
grep -E "CreditVault:|MockUSDT:" "$LOGS/deploy.log" | sed 's/^ */  /'

# The test USDT faucet pays from the operator wallet, so give it mock USDT to hand out.
USDT=$(jq -r .usdt contracts/deployments/31337.json)
OPERATOR=$(cast wallet address --private-key "$ANVIL_KEY")
cast send "$USDT" "mint(address,uint256)" "$OPERATOR" 1000000000 --private-key "$ANVIL_KEY" --rpc-url "$RPC" >/dev/null
echo "  faucet funded with 1000 mock USDT"

echo "building the SDK and React kit"
npm run build -w @credits/sdk -w @credits/react --silent

echo "starting the API and hosted pages"
# Explicit env wins over apps/api/.env, so the Whitechain keys there are never used locally.
CHAIN_ID=31337 PORT=4000 DATA_DIR=./data/local OPERATOR_KEY="$ANVIL_KEY" ADMIN_TOKEN=dev-admin RPC_URL="$RPC" \
  npm run dev -w @credits/api >"$LOGS/api.log" 2>&1 &
for _ in $(seq 1 60); do curl -sf -o /dev/null localhost:4000/v1/health && break; sleep 0.5; done
NEXT_PUBLIC_CHAIN_ID=31337 npm run dev -w @credits/web >"$LOGS/web.log" 2>&1 &

cat <<MSG

  Hosted pages   http://localhost:3000
  API            http://localhost:4000/v1/health
  Logs           $LOGS/

Press Ctrl+C to stop.
MSG
wait
