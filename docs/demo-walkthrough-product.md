# Product Walkthrough: User-First Recording Runbook

Validated click-by-click journey for recording the current user-first product experience. Complements the protocol-focused [90-second SCF script](./demo-script.md).

## Preparation

```powershell
# Fresh demo state, optional for local recording
Remove-Item data/runtime-state.json -ErrorAction SilentlyContinue
npm run dev:watch
```

Open `http://localhost:4179` or the production domain. No env vars are required. The sidebar shows the `DEMO DATA` chip; simulated settlements are always labeled `SIMULATED`, on-chain items `VERIFIED`.

For mobile recordings use a 390x844 viewport. The navigation collapses into the drawer behind the top-right menu button. All routes should render without horizontal overflow.

## The journey

| Step | Action | What the screen shows |
| --- | --- | --- |
| 1. Home `/` | Pause on the hero | `Dile que necesitas. El agente busca opciones, prepara el pago y tu apruebas.` |
| 2. Ask | Type `extraer informacion de una web` or click a suggested service | Timeline: `Buscando servicios...` -> `Controles listos. Propuesta preparada.` -> `Revisar propuesta` |
| 3. Review | Click **Revisar propuesta** | `/spend?intent=...`: what will be bought, cost, recommendation, controls passed and data not shared |
| 4. Decide | Click **Aprobar pago de prueba** or **Descartar** | Approval records a sanitized demo receipt; discard clears the proposal without paying |
| 5. Activity | Follow the redirect or open **Activity** | Proposals, demo payments, verified evidence and feedback are shown in plain language |
| 6. Trust beat | Open **Trust & Builders -> Evidence** | Public evidence backed by `GET /api/evidence`, with pending items never showing fabricated hashes |

Alternate beats to capture:

- **Descartar**: from Review, click **Descartar** on a pending proposal. It leaves the queue and the toast confirms no payment was made.
- **No match**: ask for something unavailable. The timeline explains and offers the directory.
- **Discover**: `/discover` searches service options directly and lets the user create a proposal.
- **Permissions**: `/wallet` explains that the user defines what the agent may do before technical Contract Account details.

## Clean API surface behind the journey

All product endpoints return JSON; errors use `{ "error": string }` with proper status codes. No PII, secrets, signatures, or raw XDR ever appear in public payloads.

| Endpoint | Used by | Purpose |
| --- | --- | --- |
| `GET /api/home` | Home | Agent mode, policy, summary counts, recommendations, pending proposals, recent verified activity |
| `GET /api/providers?q=` | Home timeline, Discover | Term-based directory search for Stellar USDC services |
| `POST /api/intents` | Timeline, Discover | Create a proposal `{ providerId, intentType }` |
| `GET /api/spend` | Review | Prepared proposals, per-intent policy evaluations and sanitized receipts |
| `POST /api/intents/:id/prepare` | Review approve flow | Rail preparation; still requires human confirmation |
| `POST /api/intents/:id/proof` | Review approve flow | Privacy proof without revealing identifiers |
| `POST /api/intents/:id/approve` | **Aprobar pago de prueba** | Single human authorization; returns the sanitized receipt |
| `POST /api/intents/:id/dismiss` | **Descartar** | Reject without paying; settled intents cannot be dismissed |
| `GET /api/activity` | Activity | Verified on-chain evidence plus sanitized receipts; simulated ones are clearly flagged |
| `GET /api/evidence` | Evidence, public | Versioned public evidence manifest |

## Recording gate

Every financial submit gate stays closed, never show terminal environment variables, and never present a `SIMULATED` receipt as an on-chain settlement.