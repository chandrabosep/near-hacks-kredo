#!/usr/bin/env bash
# Deploys the Kredo vault to NEAR mainnet, holding real USDT (usdt.tether-token.near), and writes
# contracts/deployments/mainnet.json. This spends real NEAR, so it asks before sending anything.
#
#   OWNER=yourname.near scripts/deploy-mainnet.sh
#
# OWNER must be a mainnet account whose key near-cli can use (~/.near-credentials/mainnet/<OWNER>.json,
# e.g. `near account import-account using-private-key ed25519:... network-config mainnet`).
# OWNER pays for everything below, and is also the vault's owner, operator and fee recipient.
#
# Costs, roughly: 3.6 NEAR to create the vault account (its 312 KB of code needs ~3.1 NEAR of
# storage), 0.00125 NEAR to register the vault with USDT, and gas. Keep ~0.5 NEAR more on OWNER for
# registering buyers' vault storage (~0.0025 NEAR each) and relaying.
set -euo pipefail
cd "$(dirname "$0")/.."

OWNER=${OWNER:?set OWNER to your mainnet account, e.g. OWNER=yourname.near}
VAULT=${VAULT:-vault.$OWNER}
OPERATOR=${OPERATOR:-$OWNER}
FEE_RECIPIENT=${FEE_RECIPIENT:-$OWNER}
USDT=usdt.tether-token.near
VAULT_NEAR=${VAULT_NEAR:-3.6}
WASM=contracts/target/near/kredo_vault/kredo_vault.wasm
OUT=contracts/deployments/mainnet.json
NET=(network-config mainnet)

[[ -f "$HOME/.near-credentials/mainnet/$OWNER.json" ]] || {
  echo "No key for $OWNER in ~/.near-credentials/mainnet. Import it first:"
  echo "  near account import-account using-private-key <ed25519:...> network-config mainnet"
  exit 1
}
[[ -e "$OUT" ]] && { echo "$OUT already exists. Move it away to deploy again."; exit 1; }

echo "building the vault from $(git rev-parse --short HEAD)"
(cd contracts && cargo near build non-reproducible-wasm --manifest-path vault/Cargo.toml >/dev/null)
CODE_HASH=$(shasum -a 256 "$WASM" | cut -d' ' -f1)

cat <<PLAN

  NEAR MAINNET. Real money.
  Create   $VAULT  with $VAULT_NEAR NEAR, paid by $OWNER
  Deploy   $WASM ($(wc -c <"$WASM" | tr -d ' ') bytes, sha256 $CODE_HASH)
  Init     new(usdt: $USDT, owner: $OWNER, operator: $OPERATOR, fee_recipient: $FEE_RECIPIENT)
  Register $VAULT with $USDT (0.00125 NEAR)

PLAN
read -r -p "Type the vault account to go ahead: " ok
[[ "$ok" == "$VAULT" ]] || { echo "Stopped. Nothing was sent."; exit 1; }

# near-cli prints "Transaction ID: <hash>", sometimes inside colour codes.
tx_of() { perl -pe 's/\e\[[0-9;]*m//g' | grep -Eo 'Transaction ID: [A-Za-z0-9]+' | tail -1 | awk '{print $3}'; }

echo "creating $VAULT"
CREATE_TX=$(near account create-account fund-myself "$VAULT" "$VAULT_NEAR NEAR" \
  autogenerate-new-keypair save-to-legacy-keychain \
  sign-as "$OWNER" "${NET[@]}" sign-with-legacy-keychain send 2>&1 | tee /dev/stderr | tx_of)

echo "deploying and initialising"
INIT=$(jq -nc --arg u "$USDT" --arg o "$OWNER" --arg op "$OPERATOR" --arg f "$FEE_RECIPIENT" \
  '{usdt: $u, owner: $o, operator: $op, fee_recipient: $f}')
DEPLOY_TX=$(near contract deploy "$VAULT" use-file "$WASM" \
  with-init-call new json-args "$INIT" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  "${NET[@]}" sign-with-legacy-keychain send 2>&1 | tee /dev/stderr | tx_of)

echo "registering the vault with USDT"
USDT_TX=$(near contract call-function as-transaction "$USDT" storage_deposit \
  json-args "{\"account_id\":\"$VAULT\",\"registration_only\":true}" \
  prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' \
  sign-as "$OWNER" "${NET[@]}" sign-with-legacy-keychain send 2>&1 | tee /dev/stderr | tx_of)

jq -n --arg vault "$VAULT" --arg usdt "$USDT" --arg owner "$OWNER" --arg op "$OPERATOR" --arg fee "$FEE_RECIPIENT" \
  --arg create "$CREATE_TX" --arg deploy "$DEPLOY_TX" --arg reg "$USDT_TX" --arg hash "$CODE_HASH" --arg commit "$(git rev-parse HEAD)" '{
  network: "mainnet",
  rpc: "https://free.rpc.fastnear.com",
  explorer: "https://nearblocks.io",
  vault: $vault, usdt: $usdt, owner: $owner, operator: $op, feeRecipient: $fee,
  deployTx: { createAccount: $create, vault: $deploy, usdtRegistration: $reg },
  wasmSha256: $hash, commit: $commit
}' >"$OUT"

echo
echo "done: $OUT"
echo "  https://nearblocks.io/address/$VAULT"
echo "Next: buy credits from another chain with"
echo "  npx tsx scripts/intents-buy.ts --user <account> --credits 100 --from USDC@base --refund <your base address>"
