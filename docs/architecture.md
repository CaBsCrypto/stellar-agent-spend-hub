# Architecture

## Trust flow

Stellar Agent Spend Hub is a control and verification layer for agentic spending:

`Discover -> Authorize -> Policy -> Settle -> Verify`

```mermaid
flowchart LR
  Agent["Buyer agent"] --> MCP["Official MCP tool server"]
  MCP --> Directory["Provider Definition"]
  Directory --> MerchantLab["Independent Merchant Lab"]
  Authorization --> Ceremony["10-minute passkey ceremony"]
  Directory --> Authorization["Human confirmation or passkey"]
  Authorization --> Policy["Merchant, asset, amount, budget, expiry"]
  Policy --> MPP["Official Stellar MPP Charge"]
  Policy --> Account["Soroban Contract Account"]
  MPP --> Merchant["USDC merchant"]
  Account --> Merchant
  Ceremony --> Upstash
  Merchant --> Evidence["Public Evidence API"]
  Upstash["Atomic replay and request state"] --> MPP
  Upstash --> Account
  Relayer["Fee-only Vercel relayer"] --> Account
```

## Two coordinated payment paths

### Official MPP Charge

A local buyer requests the Stellar Risk API, receives a standards-based `402` challenge, validates recipient, network, asset, and the `0.01 USDC` maximum, then asks for explicit confirmation. Upstash atomically consumes the paid request before the resource and receipt are returned.

### Soroban Contract Account

A WebAuthn passkey owns the account and can grant or revoke an Ed25519 agent session. The session can authorize only the configured USDC SAC transfer to the merchant under its per-payment limit, cumulative budget, and expiry. A separate relayer pays network fees and never receives user funds.

The paths intentionally remain separate. The current MPP buyer uses a classic G-account keypair, while the Contract Account uses Soroban authorization entries. They share provider definitions, policy semantics, sanitized receipts, and public evidence.

## Main components
- `ContractAccountCeremonyService`: stores public registration material for ten minutes and permits one admin claim before deploy.

- `McpSpendHubTools`: bounded discovery, intent, preparation, status, and receipt tools with no settlement authority.
- `Merchant Lab`: independent MCP/MPP seller boundary with LCP, adversarial scenarios, resource delivery, receipts, and replay rejection.
- `ProviderKit`: validates machine-readable provider definitions and the paid-resource lifecycle.
- `MppChargeService`: official Stellar MPP seller for the Horizon-backed risk report.
- `SpendAccountV1`: contract account implementing passkey owner and bounded session authorization.
- `ContractAccountRelayer`: reconstructs canonical allowlisted calls and rejects arbitrary XDR. Runtime readiness, limits, network constants, and env validation live in `contractAccountConfig.mjs`.
- `PublicEvidenceService`: publishes verified and explicitly pending evidence. Multichain public serialization for gates, bridges, and settlement receipts lives in `multichainPublicViews.mjs`; Base/Circle/Stellar verification helpers live in `multichainVerification.mjs`.
- `SensitiveDataGuard`: blocks PII, secrets, signatures, XDR, and credential identifiers.
- `Upstash`: atomic replay protection, request state, idempotency, and sanitized receipts.
- `Horizon` and `Soroban RPC`: transaction lookup, simulation, submission, and verification.


## Modular application boundary

```mermaid
flowchart TB
  Shell["Persistent app shell"] --> Router["History API router"]
  Router --> Overview["Overview"]
  Router --> Spend["Agent Spend"]
  Router --> Providers["Providers"]
  Router --> MPPPage["Machine Payments"]
  Router --> Wallet["Permissions"]
  Router --> EvidencePage["Evidence"]
  Router --> Security["Security and Labs"]
  Router --> Store["Resource cache and request deduplication"]
  Store --> Views["Overview / Spend / Providers APIs"]
  Views --> ApiRouter["Declarative API route registry"]
  ApiRouter --> Services["Payment and policy services"]
```

The browser receives only `src/client`. Pages are loaded dynamically, share a short-lived resource cache, and cancel stale navigation work. WebAuthn code is loaded only on the Permissions route.

The API boundary is split by responsibility: `apiRouter.mjs` dispatches requests, `apiHttp.mjs` owns route matching, rewrites, JSON parsing and sanitized responses, `apiRoutes.mjs` composes domain route groups, and `productReadModels.mjs` builds UI-specific read models. Domain routes now live under `src/routes/*Routes.mjs` for admin, product, MPP/evidence, MCP pilot, Contract Account, spend intents, and multichain labs. The registry preserves existing endpoints and adds three optimized read models:

- `GET /api/overview`: evidence plus dependency diagnostics.
- `GET /api/spend`: intents, evaluations, policy, receipts, summary, and readiness.
- `GET /api/providers`: provider directory only.

`GET /api/state` remains available for compatibility. Known routes with an invalid method return `405`; malformed JSON returns `400`.

Provider Pilot is also split by boundary: `pilotService.mjs` owns request lifecycle transitions, `pilotValidation.mjs` owns idempotency, approval-token and allowlist validation, and `pilotPresentation.mjs` owns public request/evidence serialization. Settlement verification stays inside the pilot service boundary so receipt checks remain close to the claim/complete flow.

Static demo data keeps mockData.mjs as the compatibility facade while fixtures live in mockProviders.mjs, mockPolicy.mjs, and mockPayments.mjs. This keeps route and service imports stable while making provider, policy, and payment scenarios easier to review independently.

## MCP boundary

The local MCP server uses the official TypeScript SDK over stdio. Its tool layer calls `SpendHubService` rather than payment adapters directly. It can create and prepare an intent, but it cannot submit a transaction. The returned approval URL routes the human to `/spend`, preserving the same policy, privacy, idempotency, and receipt lifecycle used by the web application.

A future authenticated Streamable HTTP transport will reuse the same tool service after tenant isolation and external review. It will not introduce a second execution path.
## Security boundaries

- Buyer and session secrets remain local and never enter the browser or public repository.
- Relayer secret stays in sensitive Vercel environment variables.
- Browser handles WebAuthn but never receives relayer or buyer secrets.
- The relayer accepts semantic actions, never arbitrary transaction envelopes.
- Every public evidence panel is read-only and returns `executionAllowed=false`.
- Submit gates are closed by default and reopened only during supervised testnet acceptance.

## Deferred scope

Mainnet, autonomous production spending, MPP Session, production ZK, and LatAm bill pay are deferred until external review, operational controls, and provider validation are complete.
