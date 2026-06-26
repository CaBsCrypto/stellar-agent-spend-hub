# Sprint 05: Soroban Smart Wallet Testnet Runbook

## Goal

Deploy and invoke the Soroban Smart Wallet MVP on Stellar testnet without exposing seed phrases, secret keys, or private CLI output.

This sprint proves the next step after the local contract MVP:

```text
build contract -> deploy testnet -> init owner -> grant session -> execute allowed simulated payment -> read session
```

The contract still does not move SAC/USDC. It proves the permission layer before real asset transfers are added.

## Safety Rules

- Use Stellar CLI identities or secure storage for signing.
- Do not pass seed phrases or secret keys as command arguments.
- Do not commit `.stellar`, `.soroban`, `.env`, CLI credential output, or logs.
- Store only public values in docs or Vercel:
  - `SOROBAN_SMART_WALLET_CONTRACT_ID`
  - `SOROBAN_OWNER_PUBLIC_KEY`
  - `SOROBAN_SESSION_PUBLIC_KEY`
- Run `npm run qa:full` before and after any real testnet invoke.

## Public Env

```powershell
$env:SOROBAN_OWNER_IDENTITY="spendhub-owner"
$env:SOROBAN_SESSION_IDENTITY="spendhub-session"
$env:SOROBAN_OWNER_PUBLIC_KEY="G..."
$env:SOROBAN_SESSION_PUBLIC_KEY="G..."
$env:SOROBAN_TEST_DESTINATION="G..."
$env:SOROBAN_PROVIDER_ID="api-mcp"
$env:SOROBAN_TEST_AMOUNT="1"
```

After deploy:

```powershell
$env:SOROBAN_SMART_WALLET_CONTRACT_ID="C..."
```

## Commands

Dry-run command plan:

```powershell
npm run soroban:plan
```

Build locally:

```powershell
npm run contract:build
```

Deploy dry-run:

```powershell
npm run soroban:deploy
```

Deploy for real testnet:

```powershell
npm run soroban:deploy:execute
```

Then set the returned contract id in `SOROBAN_SMART_WALLET_CONTRACT_ID` and run:

```powershell
npm run soroban:init -- --execute
npm run soroban:grant -- --execute
npm run soroban:execute -- --execute
npm run soroban:read -- --execute
```

## Acceptance Criteria

- Contract deploy returns a public contract id.
- `init` succeeds for the owner public key.
- `grant_session` succeeds for the session signer.
- `execute_allowed_payment` succeeds for an allowlisted provider/destination under limit.
- `read_session` returns the active policy.
- Receipts/logged reports do not contain secrets or PII.

## Next Sprint

After this runbook is validated on testnet, Sprint 06 should add a guarded Stellar Asset Contract transfer path behind the same permission checks.
