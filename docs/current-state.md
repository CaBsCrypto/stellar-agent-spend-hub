# Current State

## Snapshot

Stellar Agent Spend Hub is a live, testnet-only trust demo for agentic payments. It combines an official Stellar MPP paid API with a passkey-managed Soroban Contract Account, while keeping those signing paths intentionally separate. The SCF package is prepared; submission remains blocked until both coordinated USDC payments are publicly verified.

## Public evidence source

`GET https://agente-pagos-stellar.vercel.app/api/evidence` is the canonical public manifest. The dashboard and submission materials link to it instead of inventing settlement state.

### Verified XLM foundations

- Direct payment: `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- Policy-controlled SAC transfer: `8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f`.
- Guarded runtime settlement: `cb9bf9fcef3a79d045285b9c82a2633d8e78f36e9625fd6fb46ab799aae7152e`.

### Coordinated USDC proofs

- MPP G-account payment: `pending`, `0.01 USDC`.
- Passkey Contract Account session payment: `pending`, `0.01 USDC`.

A pending item cannot contain a transaction hash, explorer URL, or verification timestamp.

## Operational state

- Production: `https://agente-pagos-stellar.vercel.app`.
- Horizon, Soroban RPC, and Upstash diagnostics are reachable.
- Official production MPP challenge verified at exactly `0.01 USDC`.
- Spend Account V1 Wasm is installed on testnet; deployment awaits the production passkey.
- Owner and merchant USDC trustlines exist; balances remain unfunded at the last verification.
- JavaScript tests: `113/113` passing.
- Official MCP SDK server exposes five bounded tools and no settlement tool.
- Seven production routes use lazy Vanilla ESM modules and direct deep-link fallbacks.
- Static builds publish only browser-safe `src/client` modules.
- API routing is declarative with optimized Overview, Spend, and Providers read models.
- Rust tests: `31/31`.
- MPP, Contract Account deploy, and Contract Account submit gates are closed.

## Archived experiment

Policy Escrow V2 remains available only as historical technical documentation. It receives no new funds and is not part of the primary SCF demo narrative.

## Main risks

- Circle Faucet requires a human anti-bot step.
- Production passkey registration requires the user and stable RP domain.
- Contracts and relayer have not received an external security audit.
- Non-MPP demo intents still use local or temporary persistence.
- Mainnet, autopilot, production ZK, and LatAm bill pay remain out of scope.

## Next acceptance action

Use `docs/scf-acceptance-runbook.md` for one supervised session: fund testnet USDC, settle MPP, reject replay, register the passkey, deploy/fund the account, grant the session, settle its payment, publish receipts, close gates, and run final QA.
