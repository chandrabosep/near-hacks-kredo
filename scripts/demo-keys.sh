#!/usr/bin/env bash
# Registers the demo apps on a Kredo network and writes each one's
# demos/<app>/.env.local with its API key. Safe to rerun: apps whose key still works are skipped.
#
#   npm run demos:keys                       # the API from npm run dev:local
#   API=https://api.example ADMIN_TOKEN=... PAYOUT=you.testnet npm run demos:keys
set -euo pipefail
cd "$(dirname "$0")/.."

API=${API:-http://localhost:4000}
PAGES=${PAGES:-http://localhost:3000}
ADMIN_TOKEN=${ADMIN_TOKEN:-dev-admin-token}
# The NEAR account the demo apps' earnings are paid to. Defaults to the deployment's owner.
PAYOUT=${PAYOUT:-$(jq -r .owner contracts/deployments/testnet.json)}

curl -sf -o /dev/null "$API/v1/health" || { echo "Kredo API not reachable at $API. Start it with: npm run dev:local"; exit 1; }

register() {
  local dir=$1 name=$2
  local env=demos/$dir/.env.local
  local key
  key=$(grep -E '^CREDITS_API_KEY=' "$env" 2>/dev/null | cut -d= -f2- || true)
  if [[ -n "$key" ]] && curl -sf -o /dev/null -H "authorization: Bearer $key" "$API/v1/app"; then
    echo "  $name: key in $env still works, skipped"
    return
  fi

  local res
  res=$(curl -sf -X POST "$API/v1/admin/apps" \
    -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
    -d "{\"name\":\"$name\",\"payout\":\"$PAYOUT\"}") || { echo "  $name: registration failed (check ADMIN_TOKEN)"; exit 1; }
  key=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).apiKey)' "$res")

  # Keep any AI provider keys already in the file; replace only the Kredo lines.
  local keep=""
  [[ -f "$env" ]] && keep=$(grep -vE '^(CREDITS_API_KEY|CREDITS_API_URL|NEXT_PUBLIC_CREDITS_PAGES_URL)=' "$env" || true)
  {
    echo "CREDITS_API_KEY=$key"
    echo "CREDITS_API_URL=$API"
    echo "NEXT_PUBLIC_CREDITS_PAGES_URL=$PAGES"
    [[ -n "$keep" ]] && echo "$keep"
  } >"$env"
  echo "  $name: registered, key written to $env"
}

echo "registering demo apps on $API"
register parley Parley
register lumen Lumen
