# Current State

## Snapshot

Stellar Agent Spend Hub is a functional privacy-first MVP with HTTP 402 flows, a deployed Soroban smart wallet, native XLM SAC settlement proof, and a guarded Sprint 08 runtime that separates preview receipts from real testnet settlement.

## Public evidence

- Live demo: `https://agente-pagos-stellar.vercel.app`.
- First direct Stellar testnet hash: `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- Soroban smart wallet: `CDJEHJ763TTIVHD3MMFWIKO3R2K3A6MJKWZFZDU2L6LXXKEU43CDIGZU`.
- Native XLM SAC: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.
- First policy-controlled SAC transfer: `8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f`.
- First guarded runtime settlement: `cb9bf9fcef3a79d045285b9c82a2633d8e78f36e9625fd6fb46ab799aae7152e` (ledger `3300195`).
- Contract Wasm hash: `5737b826d56ee4bb21138d501cff2eb99b3275d8b733c7258adcc1a8aa5f5b66`.
- JS tests: `64/64` passing after Sprint 08.
- Rust tests: `11/11`.

## Scores

- MVP local/demo: `88/100`.
- Security/privacy v1: `80/100`.
- Machine payments HTTP 402: `78/100`.
- Documentation/GitHub readiness: `86/100`.
- Vercel deploy readiness: `92/100`.
- Stellar testnet path: `93/100`.
- Real testnet payment executed: `92/100`.
- Smart wallet readiness: `92/100`.

## What is real today

- Provider directory, intents, policy, privacy checks, receipts and HTTP 402 work locally.
- Direct Stellar tiny settlement and Soroban native SAC settlement have public testnet hashes.
- App approvals can route through `soroban-dry-run` and now produce `preview` receipts with no fake transaction hash.
- `POST /api/admin/soroban-transfer` is bearer-protected, testnet-only, native-XLM-only, tiny-limited and idempotent within the configured runtime state.
- Real Soroban submit additionally requires `SOROBAN_SUBMIT_ENABLED=true`, `SOROBAN_EXECUTION_DRIVER=stellar-cli` and `SPEND_HUB_PAYMENT_RAIL=soroban-testnet-submit`.
- The guarded runtime produced a Horizon-verified settlement receipt using nonce `3`; its transaction hash is public evidence above.
- Submit gates remain closed by default.

## Main risks

- Vercel can expose the guarded dry-run endpoint, but its standard serverless runtime does not include local Stellar CLI identities. Real CLI submit belongs on a trusted local/CI runner until an SDK signer or managed signing service is designed.
- File/tmp idempotency is suitable for the demo, not durable production concurrency; production needs a transactional store.
- LatAm bill pay still requires a privacy vault, production-grade proofs, legal context and provider partnerships.
- Provider integrations remain simulated.

## Next move

Design durable idempotency and a non-custodial signer boundary before any mainnet or user-facing autopilot work. The next product demo should connect an HTTP 402 challenge to this guarded settlement runtime end to end.
