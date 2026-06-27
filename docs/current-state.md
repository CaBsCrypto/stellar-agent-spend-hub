# Current State

## Snapshot

Stellar Agent Spend Hub now has an official Stellar MPP Charge seller and a hardened Policy Escrow V2 locally, in addition to the verified Sprint 08 XLM/SAC settlement path. The first real USDC Charge and Escrow V2 deployment remain pending external faucet and Vercel setup.

## Public evidence

- Live demo: `https://agente-pagos-stellar.vercel.app`.
- First direct Stellar testnet hash: `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- Soroban smart wallet: `CDJEHJ763TTIVHD3MMFWIKO3R2K3A6MJKWZFZDU2L6LXXKEU43CDIGZU`.
- Native XLM SAC: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`.
- First policy-controlled SAC transfer: `8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f`.
- First guarded runtime settlement: `cb9bf9fcef3a79d045285b9c82a2633d8e78f36e9625fd6fb46ab799aae7152e` (ledger `3300195`).
- Legacy contract Wasm hash: `5737b826d56ee4bb21138d501cff2eb99b3275d8b733c7258adcc1a8aa5f5b66`.
- Policy Escrow V2 Wasm hash: `e69592e783afdbed768ed14fd1ad0d4d1f85cc7fbd6cb12a99f7ffec9a698d3c`.
- Policy Escrow V2 testnet contract: `CCNLNLFQ35CSO3QDTBXYKYGYIB4W7273AC7DTV653QOCOI46MPYZSQXH`.
- Escrow V2 grant transaction: `e4d7c0eb6d68526d4a850b831a7e8cc3e525d5e2fb33c19625b9842f9358ab9c`.
- Official MPP local challenge: `stellar/charge`, `0.01 USDC`, `stellar:testnet`.
- JS tests: `73/73` passing after Sprint 09.
- Rust tests: `25/25` across legacy contract and Policy Escrow V2.

## Scores

- MVP local/demo: `92/100`.
- Security/privacy v1: `87/100`.
- Machine payments MPP/HTTP 402: `90/100` locally.
- Documentation/GitHub readiness: `86/100`.
- Vercel deploy readiness: `92/100`.
- Stellar testnet path: `93/100`.
- Real testnet payment executed: `92/100`.
- Policy escrow readiness: `94/100` locally.
- True passkey contract-account readiness: `30/100`.

## What is real today

- Provider directory, intents, policy, privacy checks, receipts and HTTP 402 work locally.
- Direct Stellar tiny settlement and Soroban native SAC settlement have public testnet hashes.
- App approvals can route through `soroban-dry-run` and now produce `preview` receipts with no fake transaction hash.
- `POST /api/admin/soroban-transfer` is bearer-protected, testnet-only, native-XLM-only, tiny-limited and idempotent within the configured runtime state.
- Real Soroban submit additionally requires `SOROBAN_SUBMIT_ENABLED=true`, `SOROBAN_EXECUTION_DRIVER=stellar-cli` and `SPEND_HUB_PAYMENT_RAIL=soroban-testnet-submit`.
- The guarded runtime produced a Horizon-verified settlement receipt using nonce `3`; its transaction hash is public evidence above.
- Submit gates remain closed by default.
- Official MPP Charge produces a standards-based testnet USDC challenge and validates Horizon input before charging.
- Policy Escrow V2 is deployed and its active USDC-only session policy is readable on testnet; funding and transfer wait for faucet USDC.

## Main risks

- Vercel can expose the guarded dry-run endpoint, but its standard serverless runtime does not include local Stellar CLI identities. Real CLI submit belongs on a trusted local/CI runner until an SDK signer or managed signing service is designed.
- MPP includes an atomic Upstash CAS adapter, but Vercel Marketplace provisioning is pending reauthentication.
- Existing non-MPP app intents still use file/tmp persistence and are not production-concurrent.
- LatAm bill pay still requires a privacy vault, production-grade proofs, legal context and provider partnerships.
- Circle Faucet funding and the first real USDC Charge still require a human reCAPTCHA.
- The current escrow is not yet a `__check_auth` passkey contract account.

## Next move

Complete Circle Faucet funding and Vercel/Upstash provisioning, then execute and document one real MPP Charge and one Policy Escrow V2 USDC transfer. Sprint 10 begins only after both hashes are public.
