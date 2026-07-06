# Sprint 26: Agent UX Hardening

## Objective

Consolidate the Sprint 25.5 agent-first refactor (clean navigation, agent timeline, one-step approval) into a demo that any first-time user can operate and any developer can iterate on quickly, without weakening any payment gate.

## Context

Completed ahead of this sprint (uncommitted sprint 25.5 work, now on `main`):

- English-only product language; policy engine strings unified.
- Simulated receipts visibly distinct from verified on-chain evidence.
- Navigation reduced to five agent routes plus a collapsed Trust & Builders group.
- Product surface filtered to Stellar USDC service payments.
- Agent timeline on Home; single human approval; receipt handoff with highlight.
- Loading skeletons, coherent status pills, first 9 UI render tests.

## Scope

### 1. Fast dev loop (S)

- `npm run dev:watch`: esbuild context API with watch + rebuild on save, serving through the existing `scripts/serve.mjs`.
- Production build keeps `minify: true` and a bundle-size report line per chunk.
- Acceptance: editing a page module refreshes the served bundle in under 2 seconds without restarting the server.

### 2. Demo mode that says so (S)

- A visible "Demo data" chip in the sidebar footer when receipts settle on the simulated rail.
- Empty runtime state boots clean with English fixtures; document `data/runtime-state.json` reset in the README quickstart.
- Acceptance: a clean clone with zero env vars demos the full loop and never presents simulated settlement as real.

### 3. Reject and clear proposals (M)

- "Dismiss" action on proposals in Home and Approvals so the queue can be emptied without paying.
- Server: `POST /api/intents/:id/dismiss` marking the intent rejected; excluded from ready counts.
- Acceptance: UI test covers dismiss; queue metrics stay consistent after dismissal.

### 4. Browser E2E smoke (M)

- One Playwright spec driving the real loop: Home request -> timeline -> approve -> highlighted receipt in Activity.
- Runs against `npm run dev` with local fixtures; `npm run test:e2e`; excluded from `npm test` (CI optional).
- Acceptance: spec passes headless on a clean clone.

### 5. Smarter request understanding (M, stretch)

- Expand provider tags/synonyms so common outcome phrases match (research, scrape, monitor, verify payment, risk).
- Optional: pluggable `AGENT_NLU_ENDPOINT` interface stub for a future LLM-backed interpreter; no external calls by default.
- Acceptance: ten scripted natural requests map to the expected provider in tests.

### 6. Documentation truth pass (S)

- README badges and counts match reality; add the new routes/labels and `test:ui` / `dev:watch` commands.
- Update `docs/current-state.md` with the Sprint 25.5 and 26 surface.

## Out of scope

- SCF submission decision (business action, tracked separately).
- Sprint 20 pilot supervised acceptance window.
- Base x402 / CCTP evidence; multichain lab stays dormant and gated.
- Real LLM integration for the agent command box.
- Mainnet, autopilot, production ZK, LatAm bill pay.

## Order and estimate

1 -> 2 -> 3 -> 4 -> 6, with 5 as stretch. Roughly two to three focused days.

## Acceptance gate

- `npm run qa` green including new UI and E2E suites where applicable.
- Manual browser pass on the five agent routes at desktop and 390x844.
- All financial submit gates remain closed; no new env vars required for the demo.
