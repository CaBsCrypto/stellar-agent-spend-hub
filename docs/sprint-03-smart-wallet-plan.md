# Sprint 03: Soroban Smart Wallet Plan

## Summary

Sprint 03 moves the project from a server-side testnet admin key demo toward a user-controlled Stellar/Soroban payment permission model. The JS scaffold exists in `src/sorobanSmartWalletAdapter.mjs`; Sprint 04 added a compilable Soroban Rust contract that matches the tested behavior.

## Goal

Demonstrate programmable control for agentic payments on Stellar testnet:

```text
Owner funds wallet -> owner grants session permission -> agent prepares payment -> policy validates -> user confirms -> smart wallet executes allowed payment -> receipt records proof
```

## Contract model

Minimum contract responsibilities:

- `owner`: user authority that can configure, revoke, and recover permissions.
- `agent/session signer`: limited authority allowed to request or execute only approved payment paths.
- `allowlist`: permitted destination public keys or provider identifiers mapped off-chain to destinations.
- `per_payment_limit`: maximum amount per payment.
- `expires_at`: session key expiry.
- `nonce/idempotency`: prevent replay.
- `revoked`: hard stop for a session.
- default behavior: deny unless all checks pass.

## App model

The app should add a `SorobanSmartWalletAdapter` while keeping `StellarTestnetRealAdapter` as the proven baseline rail. The adapter can begin as contract-interface scaffolding plus tests if full deployment requires more tooling.

Required records in receipts:

- rail: `Soroban Smart Wallet` or `Stellar Testnet Real Rail`.
- network: `stellar:testnet`.
- contract id when available.
- session signer public key when public and safe.
- policy decision.
- transaction hash.
- no secret key, token, RUT, phone, email, account number, card data, or raw customer refs.

## Implementation phases

1. **Contract scaffold**: adapter, Rust contract, local tests and build runbook created.
2. **Policy mapping**: map existing `SpendingPolicy` to smart wallet limits, allowlist and expiration.
3. **Adapter scaffold**: add an adapter that can prepare a smart-wallet payment request and produce safe receipts.
4. **Testnet proof**: next deploy/invoke the contract on testnet; real SAC transfer remains blocked until the permission path is proven.
5. **UX evidence**: show the four control primitives in the dashboard: owner, session key, limit, allowlist.

## Acceptance criteria

- A session signer cannot pay a destination outside allowlist.
- A session signer cannot exceed per-payment limit.
- Expired/revoked session cannot execute.
- User confirmation remains required in v1.
- Receipt includes contract/session/policy evidence without PII or secrets.
- Existing `npm run qa` continues to pass.

## Non-goals

- No mainnet funds.
- No autopilot real money.
- No real LatAm bill-pay identifiers.
- No DeFi production allocation.
- No custody of user private keys by the agent.