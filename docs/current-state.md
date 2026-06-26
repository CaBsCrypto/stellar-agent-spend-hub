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
- JS QA: `npm run qa` passing with `55/55` tests.
- Contract QA: `cargo test` passing with `11/11` Rust tests.
- Soroban build: `stellar contract build` passing with Wasm hash `5737b826d56ee4bb21138d501cff2eb99b3275d8b733c7258adcc1a8aa5f5b66`.
- First SAC transfer tx: `8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f`.

## Scores

- MVP local/demo: `85/100`.
- Security/privacy v1: `76/100`.
- Machine payments HTTP 402: `78/100`.
- Documentation/GitHub readiness: `82/100`.
- Vercel deploy readiness: `92/100`.
- Stellar testnet path: `90/100`.
- Real testnet payment executed: `82/100`.
- Smart wallet readiness: `88/100`.

## What is real today

- Local app and server API are functional.
- Provider directory, intents, receipts, policy, privacy checks, and HTTP 402 flow work in the MVP.
- Vercel production is deployed.
- Stellar testnet submit has been proven once with a tiny supervised payment.`r`n- Soroban smart wallet has moved native XLM testnet via SAC after policy validation.
- Production submit gate is closed by default with `STELLAR_SUBMIT_ENABLED=false`.

## Main risks

- Real settlement still uses a server-side testnet key demo, but Sprint 04 now has a compilable Soroban smart wallet contract with owner/session signer, allowlist, limit, expiry, revoke and nonce tests.
- LatAm bill pay requires privacy vault, ZK/proof maturity, legal context, and partner/API access before real user data is handled.
- Provider integrations are simulated; Sprint 03 should preserve the MCP/API wedge while preparing real partner conversations.
- GitHub public launch must avoid committing `.vercel`, `.env*`, runtime state, build output, logs, or secrets.

## Next move

Next move: connect the deployed SAC transfer path back into the app receipt flow for a user-confirmed MCP/API payment intent, keeping dry-run and confirmation gates by default.