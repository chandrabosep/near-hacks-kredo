#!/usr/bin/env bash
# The API and hosted pages against the live vault on Whitechain Sepolia.
#
#   npm run start:whitechain
#
# Needs apps/api/.env with CHAIN_ID=1874, OPERATOR_KEY, ADMIN_TOKEN and the Privy keys
# (see apps/api/.env.example), and NEXT_PUBLIC_PRIVY_APP_ID in apps/web/.env.
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS=.logs
mkdir -p "$LOGS"
trap 'kill $(jobs -p) 2>/dev/null' EXIT

grep -q '^CHAIN_ID=1874' apps/api/.env || { echo "apps/api/.env must set CHAIN_ID=1874"; exit 1; }

npm run build -w @credits/sdk -w @credits/react --silent
npm run dev -w @credits/api >"$LOGS/api.log" 2>&1 &
for _ in $(seq 1 60); do curl -sf -o /dev/null localhost:4000/v1/health && break; sleep 0.5; done
curl -s localhost:4000/v1/health | jq -c '{chainId, vault, relayer: .relayer.balance, login}'
npm run dev -w @credits/web >"$LOGS/web.log" 2>&1 &

cat <<MSG

  Hosted pages   http://localhost:3000
  API            http://localhost:4000/v1/health   (chain 1874)
  Logs           $LOGS/

Press Ctrl+C to stop.
MSG
wait
