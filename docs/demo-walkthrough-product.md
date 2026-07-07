# Product Walkthrough: Recording Runbook

Validated click-by-click journey for recording the agent-first product experience (UI v2, Sprint 26). Complements the protocol-focused [90-second SCF script](./demo-script.md).

## Preparation

```powershell
# Fresh demo state (English fixtures, empty agent receipts)
Remove-Item data/runtime-state.json -ErrorAction SilentlyContinue
npm run dev:watch
```

Open `http://localhost:4179` (or the production domain). No env vars are required. The sidebar shows the `DEMO DATA` chip; simulated settlements are always labeled `SIMULATED`, on-chain items `VERIFIED`.

For mobile recordings use a 390x844 viewport; the navigation collapses into the drawer behind the top-right menu button. All routes render without horizontal overflow.

## The journey (validated 2026-07-06)

| Step | Action | What the screen shows |
| --- | --- | --- |
| 1. Agent Home `/` | Pause on the hero | "What should your agent handle?", Spend Agent command box, status line ("Supervised mode · N proposals ready · 3 verified payments · 90.00 USDC per payment") |
| 2. Ask | Type `search the web for my agent` and submit (or click a suggestion chip) | Agent timeline appears inline: "Found Stellar Agent Merchant Lab…" -> "Policy checks passed. Proposal prepared." -> "Waiting for you: 12.00 USDC … Review & approve" |
| 3. Review | Click **Review & approve** | `/spend?intent=…` — Approvals page: amount, agent rationale, legal context, privacy proof, 12 policy checks (all OK), policy sidebar with limits, and two actions: **Approve payment** / **Dismiss** |
| 4. Authorize | Click **Approve payment** | Button shows "Approving…", toast confirms, automatic redirect |
| 5. Receipt | (automatic) | `/activity?receipt=…` — the new receipt highlighted in gold, labeled `Agent receipt (simulated)` + `SIMULATED`, listed alongside the three `VERIFIED` on-chain settlements with explorer links |
| 6. Optional trust beat | Open **Trust & Builders -> Evidence** | Live public evidence backed by `GET /api/evidence` |

Alternate beats to capture:

- **Dismiss**: from Approvals, click **Dismiss** on a pending proposal — it leaves the queue, counters stay consistent, toast: "Proposal dismissed. No payment was made."
- **No match**: ask for something unavailable — the timeline explains and offers "Browse the directory".
- **Discover**: `/discover` searches the Stellar service directory directly.

## Clean API surface behind the journey

All product endpoints return JSON; errors use `{ "error": string }` with proper status codes. No PII, secrets, signatures, or raw XDR ever appear in these payloads.

| Endpoint | Used by | Purpose |
| --- | --- | --- |
| `GET /api/home` | Agent Home | Aggregate: agent mode, policy, summary counts, recommendations, pending proposals, recent verified activity |
| `GET /api/providers?q=` | Home timeline, Discover | Term-based directory search (Stellar USDC services only) |
| `POST /api/intents` | Timeline, Discover | Create a proposal `{ providerId, intentType }` (idempotency key supported) |
| `GET /api/spend` | Approvals | Queue, per-intent policy evaluations, receipts; product-filtered (USDC services, no dismissed) |
| `POST /api/intents/:id/prepare` | Approve flow (auto) | Rail preparation |
| `POST /api/intents/:id/proof` | Approve flow (auto, only if required) | Privacy proof without revealing identifiers |
| `POST /api/intents/:id/approve` | **Approve payment** | Single human authorization; returns the sanitized receipt |
| `POST /api/intents/:id/dismiss` | **Dismiss** | Reject without paying; settled intents cannot be dismissed (409) |
| `GET /api/activity` | Activity | Verified on-chain evidence + sanitized receipts; simulated ones flagged `status: "simulated"` |
| `GET /api/evidence` | Evidence, public | Versioned public evidence manifest (SCF source of truth) |

## Recording gate

Same rules as the SCF script: every financial submit gate stays closed, never show terminal environment variables, and never present a `SIMULATED` receipt as an on-chain settlement.
