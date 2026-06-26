# Current State

## Snapshot

Stellar Agent Spend Hub is now a functional MVP with a deployed demo, local QA, HTTP 402 machine-payment flow, privacy guardrails, and one verified Stellar testnet settlement executed from Vercel.

## Public evidence

- Live demo: `https://agente-pagos-stellar.vercel.app`.
- First testnet hash: `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- Horizon: `https://horizon-testnet.stellar.org/transactions/4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- Amount: `0.0000010 XLM`.
- Network: `stellar:testnet`.
- Finality: `submitted-testnet`.
- QA: `npm run qa` passing with `50/50` tests.

## Scores

- MVP local/demo: `85/100`.
- Security/privacy v1: `76/100`.
- Machine payments HTTP 402: `78/100`.
- Documentation/GitHub readiness: `82/100`.
- Vercel deploy readiness: `92/100`.
- Stellar testnet path: `90/100`.
- Real testnet payment executed: `65/100`.
- Smart wallet readiness: `35/100`.

## What is real today

- Local app and server API are functional.
- Provider directory, intents, receipts, policy, privacy checks, and HTTP 402 flow work in the MVP.
- Vercel production is deployed.
- Stellar testnet submit has been proven once with a tiny supervised payment.
- Production submit gate is closed by default with `STELLAR_SUBMIT_ENABLED=false`.

## Main risks

- Real settlement still uses a server-side testnet key demo, but Sprint 03 now has a Soroban smart wallet adapter scaffold with owner/session signer, allowlist, limit, expiry and revoke tests.
- LatAm bill pay requires privacy vault, ZK/proof maturity, legal context, and partner/API access before real user data is handled.
- Provider integrations are simulated; Sprint 03 should preserve the MCP/API wedge while preparing real partner conversations.
- GitHub public launch must avoid committing `.vercel`, `.env*`, runtime state, build output, logs, or secrets.

## Next move

Sprint 03 should build the minimum Soroban smart wallet architecture: owner, agent/session signer, spending limit, allowlist, expiration, revoke path, and safe receipt trail.