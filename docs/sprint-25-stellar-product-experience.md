# Sprint 25: Stellar Product Experience

## Objective

Turn the verified Stellar payment infrastructure into a product journey that a user can understand and operate without reading protocol documentation.

## Product decision

Stellar is the active product, settlement rail, wallet authority and public narrative. Multichain code remains an unlisted lab with every execution gate closed.

## User journey

`Ask -> Discover -> Prepare -> Policy -> Confirm -> Stellar Settle -> Activity`

- Agent Home starts with a task request rather than technical evidence.
- Discover searches Stellar API and MCP providers using natural terms.
- Agent Spend remains the human authorization boundary.
- Activity combines verified on-chain evidence and sanitized receipts.
- For Providers is dedicated to Provider Kit and Merchant Lab onboarding.

## Routes

- `/`: agent command center, recommendations and pending proposals.
- `/discover`: Stellar service directory.
- `/spend`: intent review and approval.
- `/activity`: payment history and public verification.
- `/wallet`: passkey and session policy.
- `/mpp`: protocol operations.
- `/providers`: builder integration surface.
- `/evidence` and `/security`: trust surfaces.
- `/treasury`: hidden experimental lab, excluded from navigation.

## Safety boundaries

- Human approval remains mandatory.
- The Home and Discover pages can create proposals but cannot settle funds.
- No wallet secret, PII, signature or XDR is exposed to client state.
- Existing SCF evidence and payment semantics are unchanged.
- Multichain gates remain closed.

## Acceptance

- Home uses one aggregate API request.
- Natural requests find relevant Stellar providers.
- Direct reload works for Discover and Activity.
- Mobile layouts do not overflow at 390x844.
- JavaScript, Rust, build, privacy and browser QA pass before production.