#!/usr/bin/env bash
# Deploys CreditVault to Whitechain Sepolia against the official test USDT, and verifies it.
#
#   npm run deploy:whitechain
#
# Reads PRIVATE_KEY from the root .env. The deployer needs a little WBT for gas
# (faucet.testnet.whitechain.io). Optional: OWNER, OPERATOR, FEE_RECIPIENT (default: deployer).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
: "${PRIVATE_KEY:?set PRIVATE_KEY in .env}"

cd contracts
forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --private-key "$PRIVATE_KEY" --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
echo
echo "Wrote contracts/deployments/1874.json. Restart the API to pick it up."
