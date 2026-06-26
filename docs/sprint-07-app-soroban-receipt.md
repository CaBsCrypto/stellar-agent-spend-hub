# Sprint 07: App Receipt Flow for Soroban SAC

## Summary

Completed locally: the app service can route user-confirmed MCP/API intents through the Soroban smart wallet adapter when explicitly configured with `SPEND_HUB_PAYMENT_RAIL=soroban`.

This does not auto-submit on-chain from the web app. It connects the product flow to the deployed Soroban/SAC proof while keeping dry-run and human confirmation as defaults.

## Configuration

```powershell
$env:SPEND_HUB_PAYMENT_RAIL="soroban"
$env:SOROBAN_SMART_WALLET_CONTRACT_ID="CDJEHJ763TTIVHD3MMFWIKO3R2K3A6MJKWZFZDU2L6LXXKEU43CDIGZU"
$env:SOROBAN_NATIVE_ASSET_CONTRACT_ID="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
$env:SOROBAN_OWNER_PUBLIC_KEY="G..."
$env:SOROBAN_SESSION_PUBLIC_KEY="G..."
```

## Verified Behavior

- Default app rail remains simulated Stellar.
- With `SPEND_HUB_PAYMENT_RAIL=soroban`, non-Link intents use `SorobanSmartWalletAdapter`.
- `prepareIntent` returns a Soroban prepared invocation using `execute_allowed_transfer` when the native SAC id is configured.
- `approveIntent` creates a privacy-safe receipt with contract id, asset contract id and smart wallet decision.
- Link/fiat simulated flows are unaffected.

## Safety

- The app receipt path is still dry-run/local by default.
- Real on-chain invocation stays in the guarded CLI path.
- No secret keys, seed phrases, tokens, PII, RUT, account numbers, phone numbers, emails or card data belong in receipts, logs or docs.

## Next

Sprint 08 completed the guarded server-side Soroban boundary with bearer auth, dry-run default, tiny native-SAC limits, idempotency and explicit testnet submit gates. See `sprint-08-soroban-runtime.md`.
