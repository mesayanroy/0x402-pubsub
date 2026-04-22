#!/usr/bin/env bash
# Deploy AF$ token to Stellar testnet
# Usage: ./deploy.sh <admin-secret>

set -euo pipefail

ADMIN_SECRET="${1:?Usage: ./deploy.sh <admin-stellar-secret>}"
NETWORK="testnet"

echo "Building AF\$ token contract..."
cargo build --manifest-path Cargo.toml --target wasm32-unknown-unknown --release

WASM="target/wasm32-unknown-unknown/release/af_token.wasm"

echo "Deploying to Stellar $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source "$ADMIN_SECRET" \
  --network "$NETWORK")

echo "Contract deployed: $CONTRACT_ID"

ADMIN_ADDRESS=$(stellar keys address --source "$ADMIN_SECRET")

echo "Initializing with admin: $ADMIN_ADDRESS..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_SECRET" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS"

echo ""
echo "✅ AF\$ Token deployed successfully!"
echo "   Contract ID: $CONTRACT_ID"
echo "   Admin: $ADMIN_ADDRESS"
echo "   Total Supply: 100,000,000 AF\$"
echo "   Faucet: 5,000 AF\$ × 3 claims per wallet"
echo ""
echo "Add to .env.local:"
echo "   NEXT_PUBLIC_AF_TOKEN_CONTRACT_ID=$CONTRACT_ID"
