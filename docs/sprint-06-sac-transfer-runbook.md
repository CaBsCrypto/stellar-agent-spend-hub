# Sprint 06: SAC Transfer Behind Soroban Policy

## Goal

Move from a permission-only proof to a testnet payment proof. The Soroban smart wallet should transfer native XLM through the Stellar Asset Contract only after session, allowlist, asset allowlist, limit, expiry and nonce checks pass.

## Public Inputs

```powershell
$env:SOROBAN_SMART_WALLET_CONTRACT_ID="C..."
$env:SOROBAN_NATIVE_ASSET_CONTRACT_ID="C..."
$env:SOROBAN_OWNER_PUBLIC_KEY="G..."
$env:SOROBAN_SESSION_PUBLIC_KEY="G..."
$env:SOROBAN_TEST_DESTINATION="G..."
$env:SOROBAN_PROVIDER_ID="api-mcp"
$env:SOROBAN_TEST_AMOUNT="1"
```

## Commands

Get native XLM SAC id:

```powershell
npm run soroban:asset
```

Build and deploy the new contract ABI:

```powershell
npm run contract:build
npm run soroban:deploy:execute
```

Initialize, grant policy with asset allowlist, fund the contract, and transfer:

```powershell
npm run soroban:init -- --execute
npm run soroban:grant -- --execute
npm run soroban:fund-contract:execute
npm run soroban:transfer:execute
npm run soroban:read -- --execute
```

## Safety

- Native XLM testnet only.
- Contract pre-funded with a tiny amount.
- No mainnet, no USDC real, no LatAm bill pay data.
- Do not print or store seed phrases, secret keys, `.stellar`, `.soroban`, `.env`, or CLI credential output.

## Acceptance Criteria

- Native SAC contract id is recorded as a public value.
- New smart wallet contract is deployed with `execute_allowed_transfer` exported.
- `grant_session` includes `allowed_assets` with the native SAC id.
- Contract receives a tiny XLM testnet balance.
- `execute_allowed_transfer` emits a receipt/event and destination balance increases.
- Public result doc contains only contract ids, public keys, tx links, amounts and QA status.