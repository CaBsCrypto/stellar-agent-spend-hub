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
- JavaScript tests: `131/131` passing before Sprint 19 additions.
- Rust tests: `31/31` passing.
- Official MCP server and independent Merchant Lab remain available.

## Submission freeze

The payment proof is complete. Owner revoke `27010be2...afc3cc` is verified, `revoked=true`, and all submit gates are closed. Remaining work is package QA, screenshots, and video capture.

## Deferred scope

Mainnet, autonomous production spending, new providers, production ZK, and LatAm bill pay remain outside this sprint. Policy Escrow V2 remains historical only.