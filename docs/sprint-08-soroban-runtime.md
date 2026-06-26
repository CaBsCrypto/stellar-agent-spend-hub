# Sprint 08: Guarded Soroban Payment Runtime

## Goal

Connect the app payment lifecycle to the existing Soroban `execute_allowed_transfer` proof without letting previews look like settlements. The runtime is admin-only, testnet-only and closed by default.

## Execution modes

| Mode | Behavior |
|---|---|
| `simulated` | Local Stellar simulation. |
| `stellar-testnet-direct` | Existing direct Stellar testnet adapter and its own submit gate. |
| `soroban-dry-run` | Builds a Soroban preview receipt; no CLI call and no transaction hash. |
| `soroban-testnet-submit` | Allows the admin endpoint to invoke the Stellar CLI only when every submit gate is enabled. |

## Required public configuration

```text
SOROBAN_NETWORK=testnet
SOROBAN_SMART_WALLET_CONTRACT_ID=C...
SOROBAN_NATIVE_ASSET_CONTRACT_ID=C...
SOROBAN_SESSION_PUBLIC_KEY=G...
SOROBAN_TEST_DESTINATION=G...
SOROBAN_PROVIDER_ID=browserbase-mcp
SOROBAN_TINY_MAX_AMOUNT=1
```

Keep `SOROBAN_SUBMIT_ADMIN_TOKEN` private. Never store a seed phrase or secret key in docs, request bodies, receipts or runtime state.

## Dry-run

Start the app with `SPEND_HUB_PAYMENT_RAIL=soroban-dry-run`, a private admin token and `SOROBAN_SUBMIT_ENABLED=false`.

```powershell
npm run dev
npm run soroban:admin-transfer
```

The result must have `status=preview`, `executionStatus=preview` and `transactionHash=null`.

## Supervised testnet submit

Use a trusted machine where the `stellar` CLI has the `spendhub-session` identity. Use a fresh nonce and idempotency key.

```powershell
$env:SPEND_HUB_PAYMENT_RAIL="soroban-testnet-submit"
$env:SOROBAN_EXECUTION_DRIVER="stellar-cli"
$env:SOROBAN_SUBMIT_ENABLED="true"
npm run soroban:admin-submit
$env:SOROBAN_SUBMIT_ENABLED="false"
$env:SPEND_HUB_PAYMENT_RAIL="soroban-dry-run"
```

A successful response must contain exactly one 64-character transaction hash. If no hash is found, the runtime records a failed attempt and never emits a settled receipt.

## Vercel boundary

The explicit Vercel function supports auth, validation and dry-run. Do not enable `stellar-cli` submit on Vercel: the serverless runtime does not own the local CLI identity. A future Vercel submit path requires an audited SDK signer or external signing service.

## Verified testnet result

On 2026-06-26 the guarded runtime executed nonce `3` for provider `api-mcp`, transferring `1` native SAC unit after all policy and submit gates passed.

| Field | Value |
|---|---|
| Status | `settled` |
| Network | `stellar:testnet` |
| Execution mode | `soroban-testnet-submit` |
| Transaction | [cb9bf9fc...7152e](https://stellar.expert/explorer/testnet/tx/cb9bf9fcef3a79d045285b9c82a2633d8e78f36e9625fd6fb46ab799aae7152e) |
| Ledger | `3300195` |
| Amount | `1` native SAC unit |
| Provider | `api-mcp` |
| Nonce | `3` |

Horizon returned `successful: true`. The admin token was generated in memory, was not stored, and the submit gate was closed immediately after execution.
## Recovery

- Reusing an idempotency key returns the previous result and does not execute again.
- A failed operation remains failed; retry with a new key and a fresh on-chain nonce after diagnosing the cause.
- Always close `SOROBAN_SUBMIT_ENABLED` after a supervised test window.
