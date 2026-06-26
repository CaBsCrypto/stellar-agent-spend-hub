# Partner Strategy

## Positioning

Stellar Agent Spend Hub should approach partners as a control and settlement layer for agentic spend, not as another wallet. The product helps providers accept agent-initiated payments while giving users policy, privacy, confirmation, and auditability.

## Route 1: MCP/API providers

Best first partner type because the flow is digital, instant, low-PII, and naturally compatible with HTTP 402.

Pitch:

- Let agents pay per request, session, or credit pack.
- Provider returns `402 Payment Required` with price and terms.
- Agent prepares payment and user confirms in v1.
- Provider receives receipt/credential and returns the resource.

Targets:

- browser automation APIs.
- search/data APIs.
- MCP servers with paid tools.
- AI infra tools and model-routing services.
- developer APIs with metered usage.

## Route 2: Stellar ecosystem and grants

Best funding route because the project now has a public testnet hash and a clear Soroban smart wallet next step.

Pitch:

- Stellar-native agentic payments with verifiable testnet settlement.
- Smart wallet controls for session keys, limits, allowlists, and revocation.
- Privacy-first receipts and future LatAm bill-pay wedge.
- Compatibility with HTTP 402/x402/MPP patterns without abandoning Stellar-first rails.

Ask:

- grant support for Soroban smart wallet MVP.
- ecosystem intros to anchors, wallet teams, and payment/API partners.
- technical review for contract account patterns and passkey/session key design.

## Route 3: Digital services and SaaS

Second commercial wedge after MCP/API because users understand the value: agents buying cloud credits, SaaS tools, reservations, subscriptions, or usage packs.

Pitch:

- The agent can prepare recurring or usage-based payments.
- The user keeps confirmation and revocation in v1.
- Receipts explain what was bought, why, under which policy, and with what transaction hash.

Targets:

- cloud/devtool credits.
- SaaS subscriptions for AI workflows.
- data providers.
- gift-card or prepaid digital providers.
- booking/reservation APIs.

## LatAm bill pay roadmap

LatAm bill pay is a strong differentiator, but should not be the first public promise. It needs partner/API access and privacy maturity before handling RUT, phone, customer numbers, addresses, or bill identifiers.

Required before real launch:

- privacy vault or secure provider.
- ZK commitment/proof or equivalent privacy-preserving verification.
- legal context and explicit consent UX.
- partner contract or aggregator API.
- strict receipt rules with no PII.