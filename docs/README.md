# Project Documentation

## Start here

1. [Current state](./current-state.md): verified evidence, pending gates, and current risks.
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
13. [Sprint 14-16 status](./sprint-14-16-status.md): completed work and submission blockers.
14. [Sprint 17 modular routing](./sprint-17-modular-routing.md): route map, client boundary, and API refinement.

## Product and distribution

- [Product](./product.md)
- [Privacy and security](./privacy-security.md)
- [Partner strategy](./partner-strategy.md)
- [Partner shortlist](./partner-shortlist.md)
- [Roadmap](./roadmap.md)
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
