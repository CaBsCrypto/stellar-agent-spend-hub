# SCF Pitch Deck Narrative

## Slide 1 - Stellar Agent Spend Hub

**Agents can pay. Users keep control.**

Stellar-native machine payments for MCP/API services, with bounded permissions and privacy-safe receipts.

## Slide 2 - The trust gap

- Agents need to buy digital resources in real time.
- Repeated approval removes useful automation.
- Broad wallet access creates custody, replay, and spending risk.
- Providers need payment plus delivery, not another disconnected wallet.

## Slide 3 - One trust flow

`Discover -> Authorize -> Policy -> Settle -> Verify`

Provider definitions make price and requirements machine-readable. Human authorization creates bounded authority. Stellar settles. Public evidence proves the result without exposing private data.

## Slide 4 - Proof A: interoperable payment

- Official Stellar MPP Charge.
- `0.01 USDC` for a Horizon-backed Stellar Risk API.
- Local buyer confirmation and fixed recipient, network, asset, and maximum price.
- Atomic replay protection through Upstash.

**Submission evidence:** public settlement hash plus rejected replay.

## Slide 5 - Proof B: programmable control

- Soroban contract account owned by a production-domain passkey.
- Ed25519 agent session valid for 24 hours.
- Merchant and USDC asset fixed on-chain.
- `0.01 USDC` per payment and `0.02 USDC` cumulative budget.

**Submission evidence:** public settlement hash plus blocked invalid action.

## Slide 6 - Why Stellar

- Payment-oriented network and stablecoin settlement.
- Official MPP SDK for machine commerce.
- Soroban contract accounts for programmable authorization.
- Stellar Asset Contracts for consistent token operations.
- Public, low-cost verification and strong LatAm relevance.

## Slide 7 - What is already real

- Live Vercel demo and public Evidence API.
- Two verified `0.01 USDC` coordinated payments plus three XLM foundations.
- MPP payment `8290da7e...985836`, paid resource delivery, and replay rejection.
- Human passkey Contract Account payment `b37ab921...6af094`.
- Upstash replay store and dependency diagnostics.
- Full JavaScript and Rust test suites.

Both coordinated proofs are live in the Evidence API. The Contract Account lifecycle separately proves deploy, funding, grant, payment, replay rejection, and owner revoke.

## Slide 8 - Go to market

1. MCP and API providers selling metered digital resources.
2. One sandbox design-partner integration through the Provider Kit.
3. Supervised beta with agent developers and crypto power users.
4. Digital-service expansion.
5. Privacy-first LatAm bill pay only after security and partner gates.

## Slide 9 - Funding and outcomes

**Request: US$75,000 equivalent in XLM over 24 weeks.**

- $12k: Testnet Trust Demo.
- $18k: Provider Kit Pilot.
- $25k: Security and Beta.
- $20k: Mainnet Readiness.

Targets: one provider integration, 20 beta users, 100 successful testnet payments, zero accepted replays, and zero PII findings in receipts.

## Slide 10 - The ask

Help make Stellar the safest place for agents to buy digital services.

- Funding for product, provider adoption, and security review.
- Technical feedback on contract-account authorization.
- Introductions to Stellar wallets, anchors, and API providers.