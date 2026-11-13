#!/usr/bin/env bash
# The API and the hosted pages on this machine, against the Kredo vault on NEAR testnet.
#
#   npm run dev:local
#
# The relayer key is read from near-cli's credentials (~/.near-credentials/testnet/<relayer>.json),
# or from RELAYER_PRIVATE_KEY. Then open http://localhost:3000 for the hosted pages.
# Fund a signed-in user with test USDT: npm run fund:testnet -- <account> [usdt]
set -euo pipefail
cd "$(dirname "$0")/.."

LOGS=.logs
mkdir -p "$LOGS"
DEPLOY=contracts/deployments/testnet.json
RELAYER=${RELAYER_ACCOUNT_ID:-$(jq -r .operator "$DEPLOY")}

if [[ -z "${RELAYER_PRIVATE_KEY:-}" && ! -f "$HOME/.near-credentials/testnet/$RELAYER.json" ]]; then
  echo "No key for $RELAYER. Set RELAYER_PRIVATE_KEY, or import it with near-cli:"
  echo "  near account import-account using-private-key <ed25519:...> network-config testnet"
  exit 1
fi

# Stop everything this script started when it exits.
trap 'kill $(jobs -p) 2>/dev/null' EXIT

echo "vault $(jq -r .vault "$DEPLOY"), relayer $RELAYER on NEAR testnet"

echo "building the SDK and React kit"
npm run build -w kredo -w kredo-react --silent

echo "starting the API and hosted pages"
NEAR_NETWORK=testnet PORT=4000 DATA_DIR=./data/local ADMIN_TOKEN=${ADMIN_TOKEN:-dev-admin-token} \
  npm run dev -w @credits/api >"$LOGS/api.log" 2>&1 &
for _ in $(seq 1 60); do curl -sf -o /dev/null localhost:4000/v1/health && break; sleep 0.5; done
npm run dev -w @credits/web >"$LOGS/web.log" 2>&1 &

cat <<MSG

  Hosted pages   http://localhost:3000
  API            http://localhost:4000/v1/health
  Logs           $LOGS/

Press Ctrl+C to stop.
MSG
wait
