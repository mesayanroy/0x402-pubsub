#!/bin/bash
# deploy.sh — Deploy AgentRegistry to Stellar Testnet
# Prerequisites: stellar CLI installed and configured
# Install: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup

set -e

echo "🚀 Building AgentRegistry contract..."
cd contracts/agent_registry
stellar contract build

WASM_FILE="target/wasm32-unknown-unknown/release/agent_registry.wasm"

echo "📦 Optimizing WASM..."
stellar contract optimize --wasm "$WASM_FILE"

OPTIMIZED_WASM="target/wasm32-unknown-unknown/release/agent_registry.optimized.wasm"

echo "⬆️  Deploying to Stellar Testnet..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$OPTIMIZED_WASM" \
  --source alice \
  --network testnet)

echo "✅ Contract deployed!"
echo "Contract ID: $CONTRACT_ID"
echo ""
echo "📝 Add to your .env.local:"
echo "NEXT_PUBLIC_SOROBAN_CONTRACT_ID=$CONTRACT_ID"
echo ""
echo "🧪 Test: register an agent"
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source alice \
  --network testnet \
  -- register_agent \
  --owner alice \
  --agent_id test_agent_1 \
  --price_xlm 500000 \
  --metadata_hash "ipfs_hash_placeholder"
