# Soroban Smart Wallet Contract Interface

Sprint 03 target: replace the server-side testnet key demo with a user-controlled Soroban smart wallet permission model.

This folder documents the minimum contract interface before adding production Soroban Rust code. The JavaScript adapter and tests already enforce the same behavioral contract off-chain.

## Minimal state

- `owner`: user authority that can configure and revoke sessions.
- `session_signer`: agent signer allowed to request limited payments.
- `allowed_destinations`: public destinations the session may pay.
- `allowed_providers`: optional provider ids mirrored from off-chain directory.
- `per_payment_limit`: maximum amount for one payment.
- `expires_at`: session expiry timestamp.
- `revoked`: hard stop flag.
- `nonce`: replay protection for execution requests.

## Required methods

```text
init(owner)
grant_session(owner_auth, session_signer, allowed_destinations, allowed_providers, per_payment_limit, expires_at)
revoke_session(owner_auth, session_signer)
execute_allowed_payment(session_auth, destination, asset, amount, provider_id, nonce)
read_session(session_signer)
```

## Execution rules

- Deny by default.
- Require owner auth for grants and revokes.
- Require session auth for execution.
- Block if session is revoked or expired.
- Block if destination/provider is outside allowlist.
- Block if amount exceeds `per_payment_limit`.
- Emit enough public event data for a receipt without PII.

## Current implementation status

- Off-chain adapter: `src/sorobanSmartWalletAdapter.mjs`.
- Tests: allowlist, amount limit, expiry, revoke, and safe receipt fields.
- Next step: create Soroban Rust contract and local/testnet deploy runbook.