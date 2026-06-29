# Sprint 17: Modular Routing and Refinement

## Result

The original single-page dashboard was separated into seven focused routes without changing payment, policy, receipt, MPP, Contract Account, or evidence semantics.

## Route map

- `/`: product and coordinated proof overview.
- `/spend`: payment intents, policies, privacy review, approval, and receipts.
- `/providers`: Provider Directory and Provider Kit.
- `/mpp`: official Stellar MPP paid-resource lifecycle.
- `/wallet`: passkey owner and Contract Account session controls.
- `/evidence`: Live/Replay evidence and dependency diagnostics.
- `/security`: privacy controls plus a secondary Labs and roadmap view.

## Architecture changes

- Vanilla ESM History API router with direct reload support.
- Persistent desktop sidebar and compact mobile navigation.
- Dynamically imported page modules.
- Short-lived resource cache with request deduplication and invalidation after mutations.
- Navigation cancellation prevents stale responses from rendering.
- Declarative API route registry replaces the long conditional handler.
- New `/api/overview`, `/api/spend`, and `/api/providers` read models reduce over-fetching.
- Static build copies only `src/client`; server modules are excluded.
- Local static server allowlists client assets and exact SPA routes.

## Compatibility and security

- Existing API paths remain available.
- `/api/state` remains a compatibility endpoint.
- Pending evidence invariants remain unchanged.
- Replay remains read-only.
- Passkey code loads only on `/wallet`.
- Mainnet and every submit gate remain disabled.

## Verification

- `104/104` JavaScript tests.
- `31/31` Rust tests.
- Direct-route, cache, cancellation, `400/404/405`, and public-build tests added.
- Desktop and mobile browser QA required before production promotion.