# Stellar Community Fund Application Package

## One-line pitch

Stellar Agent Spend Hub lets AI agents pay for APIs with USDC while users retain
control through passkeys, bounded session permissions and public privacy-safe
receipts.

## Problem

Agent wallets usually force a bad choice between repeated human friction and
dangerously broad autonomous access. API providers also lack a simple path from
resource discovery to verifiable payment without exposing card or user data.

## Stellar differentiation

- Official Stellar MPP Charge for interoperable machine payments.
- Soroban Contract Account with WebAuthn owner authorization.
- Ed25519 agent sessions limited by merchant, asset, amount, budget and expiry.
- Low-cost USDC settlement with public testnet evidence.
- Provider Kit for MCP/API monetization.
- Privacy firewall that excludes PII, signatures and XDR from receipts.

## Current evidence

- Direct Stellar testnet settlement.
- Policy-controlled native SAC transfer.
- Guarded Soroban runtime settlement.
- Policy Escrow V2 deployed on testnet.
- Spend Account V1 Wasm installed on testnet.
- Official MPP challenge passing locally.
- `90/90` JavaScript and `31/31` Rust tests.

The final coordinated MPP and Contract Account USDC hashes remain pending Circle
Faucet, Vercel/Upstash provisioning and the production-domain passkey ceremony.

## Proposed milestones

| Milestone | Deliverable | Completion measure | Suggested budget |
| --- | --- | --- | ---: |
| 1. Testnet Trust Demo | MPP and passkey Contract Account settlements | Two public `0.01 USDC` hashes, replay rejection and live demo | $12,000 |
| 2. Provider Kit Pilot | Reusable Node/MCP integration and design partners | Three provider interviews, one sandbox integration and public docs | $18,000 |
| 3. Security and Beta | External review, recovery design and user pilot | Security report, 20 test users and at least 100 successful testnet payments | $25,000 |
| 4. Mainnet Readiness | Operational controls and compliant launch plan | Audit remediation, monitoring, incident runbook and launch decision | $20,000 |

Suggested request: `$75,000` equivalent in XLM, released against measurable
deliverables. Mainnet activation is not promised before security review.

## Metrics

- Successful and blocked payments by policy reason.
- MPP challenge-to-settlement conversion.
- Replay rejection and duplicate-submit rate.
- Provider integration time.
- Weekly active test users.
- Public receipts with zero PII findings.
- Median settlement latency and API availability.

## Two-week submission checklist

- Stable Vercel domain and Upstash-backed replay protection.
- Two coordinated USDC testnet settlements.
- Public Evidence API and explorer links.
- Desktop/mobile demo verification.
- Threat model and 90-second demo video.
- Repository README and architecture diagrams.
- Three initial provider interview requests.

SCF currently describes Build funding of up to `$150,000` in XLM across award
tracks. Final amount, track and requirements must be checked immediately before
submission: <https://communityfund.stellar.org/>.
