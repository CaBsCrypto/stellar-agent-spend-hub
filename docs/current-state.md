# Current State

## Snapshot

Stellar Agent Spend Hub now has an official Stellar MPP Charge seller and a hardened Policy Escrow V2 locally, in addition to the verified Sprint 08 XLM/SAC settlement path. Spend Account V1 now adds real WebAuthn and session-key authorization, while final USDC settlements remain pending faucet, production passkey and Vercel setup.

## Public evidence

- Vercel deploy: pending CLI reauthentication; the previous public alias currently returns 404.
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
- JS tests: `84/84` passing after Sprint 10 runtime work.
- Rust tests: `31/31` across legacy wallet, Policy Escrow V2 and Spend Account V1.
- Spend Account V1 Wasm upload: `e03bcebf3ba684d4cff805cd2f990722e92c07881e159a13d93f6204b8aa8d80`.
- Merchant: `GAJK6AKXWGMRNRNZRLPZ5J7MUT4X7TZWHPEFEJJ5TL7V7XWPYKGG2CNV`.
- Relayer: `GD2HWVSSD5I64HD5LCPCXW6NKSJLQRSL5V4OGBOIDRDCXM4VZRJBBKC6`.


## Scores

- MVP local/demo: `92/100`.
- Security/privacy v1: `87/100`.
- Machine payments MPP/HTTP 402: `90/100` locally.
- Documentation/GitHub readiness: `86/100`.
- Vercel deploy readiness: `92/100`.
- Stellar testnet path: `93/100`.
- Real testnet payment executed: `92/100`.
- Policy escrow readiness: `94/100` locally.
- True passkey contract-account readiness: `78/100` locally; instance deployment awaits the production passkey.

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
- Spend Account V1 implements `__check_auth`; final production-domain passkey registration and testnet instance deployment remain pending.
- Vercel CLI is unauthenticated and Upstash Marketplace cannot be provisioned until login is restored.
- Owner and merchant USDC trustlines exist, but both balances are currently zero.

## Next move

Complete Circle Faucet funding and Vercel/Upstash provisioning, then execute and document one real MPP Charge and one Policy Escrow V2 USDC transfer. Then deploy Spend Account V1 from the production-domain passkey, grant the session and execute its policy-controlled USDC payment.
