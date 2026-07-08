# Project Documentation

## Start here

1. [Current state](./current-state.md): verified evidence, freeze status, and current risks.
2. [SCF application](./scf-application.md): funding request, milestones, metrics, and impact.
3. [Resumen ejecutivo SCF](./scf-executive-summary-es.md): Spanish executive summary.
4. [Architecture](./architecture.md): the two coordinated Stellar payment paths.
5. [Public evidence contract](./public-evidence.md): canonical schema and anti-fabrication invariants.
6. [Threat model](./threat-model.md): assets, trust boundaries, controls, and residual risks.
7. [Provider Kit](./provider-kit.md): reusable MPP integration for Node/MCP providers.
8. [MCP agent interface](./mcp-server.md): official SDK tools and human approval boundary.
9. [SCF pitch deck](./scf-pitch-deck.md): ten-slide narrative.
10. [Demo script](./demo-script.md): final 90-second English narration.
11. [Demo storyboard](./demo-storyboard.md): shots, timing, and capture checklist.
12. [Acceptance runbook](./scf-acceptance-runbook.md): supervised Faucet, MPP, and passkey session.
13. [Contract Account fixture result](./contract-account-fixture-result.md): verified USDC policy payment before the human passkey ceremony.
14. [Sprint 14-16 status](./sprint-14-16-status.md): completed work and submission blockers.
15. [Sprint 17 modular routing](./sprint-17-modular-routing.md): route map, client boundary, and API refinement.
16. [Sprint 21-23 multichain](./sprint-21-23-multichain.md): Stellar-first routing, Privy, Base x402 and CCTP runbook.
17. [Sprint 24 Base acceptance](./sprint-24-base-x402-acceptance.md): encrypted merchant identity, readiness doctor and supervised payment runbook.
18. [Sprint 25 Stellar product experience](./sprint-25-stellar-product-experience.md): Agent Home, Discover, Activity and focused provider onboarding.
19. [Non-expert user test guide](./non-expert-user-test-guide.md): five-session feedback script for curious users.
20. [Release checklist](./release-checklist.md): local gates, deploy steps, smoke checks and log review.

## Product and distribution

- [Product](./product.md)
- [Privacy and security](./privacy-security.md)
- [Partner strategy](./partner-strategy.md)
- [Partner shortlist](./partner-shortlist.md)
- [Roadmap](./roadmap.md)
- [Sprint 20 Remote MCP Provider Pilot](./sprint-20-provider-pilot.md)
- [Sprint 28 Feedback Review Loop](./sprint-28-feedback-review-loop.md)
- [Vercel deployment](./deploy-vercel.md)

## Historical implementation record

The following files preserve earlier testnet and contract experiments. They are engineering history, not the primary SCF narrative.

- [First direct testnet payment](./sprint-02-testnet-payment-result.md)
- [Soroban smart-wallet plan](./sprint-03-smart-wallet-plan.md)
- [Soroban testnet deployment](./sprint-05-soroban-testnet-result.md)
- [Native SAC transfer](./sprint-06-sac-transfer-result.md)
- [Guarded Soroban runtime](./sprint-08-soroban-runtime.md)
- [Archived MPP and escrow experiment](./sprint-09-mpp-escrow-v2.md)
- [Contract Account V1](./sprint-10-contract-account.md)
- [Sprint 11-13 implementation record](./sprint-11-13-status.md)

## Hard rules

- Stellar testnet only until security and operational gates pass.
- Human authorization remains mandatory in v1.
- Pending evidence never carries a transaction hash.
- No PII, secrets, signatures, XDR, credential IDs, or customer references in public logs or receipts.
- LatAm bill pay remains deferred until privacy and partner requirements are production-ready.

21. [Human passkey acceptance](./contract-account-human-acceptance.md): deploy, funding, grant, payment, replay, and revoke lifecycle.
22. [Frozen SCF evidence](./scf-evidence-snapshot.json): sanitized submission snapshot generated from production.
