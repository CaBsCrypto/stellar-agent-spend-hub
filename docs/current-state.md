# Current State

## Snapshot

Stellar Agent Spend Hub is a live, testnet-only trust demo for agentic payments. It combines an official Stellar MPP paid API with a passkey-managed Soroban Contract Account. Both coordinated `0.01 USDC` payments are publicly verified.

## Canonical evidence

`GET https://agente-pagos-stellar.vercel.app/api/evidence` is the source of truth.

- MPP payment: `8290da7e4da419d824f49da6a8ad21fb7e5117cccf861c923dc21e299e985836`.
- Contract Account payment: `b37ab9217c108b023abcb3905d4fee98d32999b23d800c9471f82aeb646af094`.
- Contract Account: `CASKG5OOMM2WH6RDCO7FX4XFP6T62SX22WXVTFPIIP2XKGXBHZ4L7HPO`.
- Replay acceptance: first submit `200`; identical replay `409`; one balance movement.

The Contract Account lifecycle also records deploy, funding, grant, payment, and revoke status. Human amounts and base units are exposed separately.

## Operational state

- Production, Upstash, Horizon, and Soroban RPC are operational.
- Contract Account balance after payment: `0.01 USDC`.
- Merchant balance after payment: `0.03 USDC`.
- Session policy spent: `0.01` of `0.02 USDC`.
- Submit and deploy gates are closed outside supervised acceptance windows.
- JavaScript tests: `163/163` passing.
- Rust tests: `31/31` passing.
- Official MCP server and independent Merchant Lab remain available.
- Sprint 20 Remote MCP Provider Pilot is implemented with its production gate closed pending supervised acceptance.
- Sprint 25 Stellar product experience is implemented: Agent Home, Discover, Activity, supervised proposals and provider onboarding.
- Sprint 21 multichain code remains available only as a hidden, gated architecture lab.
- Sprint 22 Base Sepolia x402 seller/buyer paths are implemented; real `0.01 USDC` evidence remains pending Privy configuration and testnet funding.
- Sprint 23 CCTP Base-to-Stellar prepare/monitor paths are implemented; real `1 USDC` evidence remains pending the forwarding contract, destination trustline and funding.
- Avalanche Fuji is visible for readiness and Privy network switching but submit is hard-disabled.

## Multichain safety state

- Stellar and EVM signing authorities remain separate.
- All multichain, Base x402, CCTP and Avalanche gates are closed by default.
- Per-network balances are never presented as a pooled balance.
- A bridge is a distinct human-confirmed intent and never a payment side effect.
- No Base or CCTP transaction is listed as verified yet.

## Submission freeze

The SCF payment proof is frozen and complete. Owner revoke `27010be2...afc3cc` is verified, `revoked=true`, and all financial submit gates are closed. Provider Pilot evidence is maintained separately.

## Deferred scope

Mainnet, autonomous production spending, new providers, production ZK, and LatAm bill pay remain outside this sprint. Policy Escrow V2 remains historical only.