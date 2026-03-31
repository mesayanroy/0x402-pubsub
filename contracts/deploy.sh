#!/bin/bash
# deploy.sh — Deploy AgentRegistry + AgentValidator to Stellar Testnet
# Prerequisites: stellar CLI installed and configured
# Install: https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup

set -e

echo "🚀 Building AgentRegistry contract..."
cd contracts/agent_registry
stellar contract build --optimize
REGISTRY_WASM="target/wasm32v1-none/release/agent_registry.wasm"

echo "⬆️  Deploying AgentRegistry to Stellar Testnet..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm "$REGISTRY_WASM" \
  --source alice \
  --network testnet)

echo "✅ AgentRegistry deployed: $REGISTRY_ID"
cd ../..

echo ""
echo "🚀 Building AgentValidator contract..."
cd contracts/agent_validator
stellar contract build --optimize
VALIDATOR_WASM="target/wasm32v1-none/release/agent_validator.wasm"

echo "⬆️  Deploying AgentValidator to Stellar Testnet..."
VALIDATOR_ID=$(stellar contract deploy \
  --wasm "$VALIDATOR_WASM" \
  --source alice \
  --network testnet)

echo "✅ AgentValidator deployed: $VALIDATOR_ID"

echo ""
echo "🔗 Initializing AgentValidator with AgentRegistry address..."
echo "   (inter-contract link established)"
stellar contract invoke \
  --id "$VALIDATOR_ID" \
  --source alice \
  --network testnet \
  -- initialize \
  --admin alice \
  --registry "$REGISTRY_ID"

echo ""
echo "📝 Add to your .env.local:"
echo "NEXT_PUBLIC_SOROBAN_CONTRACT_ID=$REGISTRY_ID"
echo "NEXT_PUBLIC_SOROBAN_VALIDATOR_ID=$VALIDATOR_ID"
cd ../..

echo ""
echo "🧪 Test inter-contract call flow:"
echo "  Step 1: Validate wallet"
stellar contract invoke \
  --id "$VALIDATOR_ID" \
  --source alice \
  --network testnet \
  -- validate_wallet \
  --deployer alice \
  --agent_id test_agent_1

echo "  Step 2: Request deploy"
stellar contract invoke \
  --id "$VALIDATOR_ID" \
  --source alice \
  --network testnet \
  -- request_deploy \
  --deployer alice \
  --agent_id test_agent_1 \
  --metadata_hash "ipfs_hash_placeholder" \
  --price_stroops 500000

echo "  Step 3: Confirm deploy (inter-contract call → AgentRegistry.register_agent)"
stellar contract invoke \
  --id "$VALIDATOR_ID" \
  --source alice \
  --network testnet \
  -- confirm_deploy \
  --deployer alice \
  --agent_id test_agent_1 \
  --signature_hash "0000000000000000000000000000000000000000000000000000000000000000"

echo ""
echo "🎉 All done! Both contracts deployed and inter-contract link verified."

