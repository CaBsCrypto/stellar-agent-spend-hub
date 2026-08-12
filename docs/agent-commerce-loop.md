# Agent Commerce Loop

## Product thesis

Stellar Agent Spend Hub and Stellar Agent Merchant Lab form the buyer and seller
sides of one bounded agent-commerce network:

1. GEO and provider metadata make a merchant discoverable.
2. WebMCP exposes product discovery and purchase preparation in the visible page.
3. Merchant Lab creates a machine-readable quote and HTTP 402 challenge.
4. Spend Hub validates merchant, network, asset, amount, expiry and budget.
5. The current pilot requires explicit human confirmation before signing.
6. Stellar MPP settles USDC and Merchant Lab releases the resource.
7. Buyer and merchant retain privacy-safe, replay-resistant evidence.

## Trust boundaries

- WebMCP never receives or exposes buyer signing authority.
- A merchant page can prepare a purchase but cannot execute a payment.
- Spend Hub treats merchant descriptions and tool output as untrusted input.
- Every order is bound to an exact merchant, asset, network, amount and expiry.
- Idempotency and replay protection apply before settlement and delivery.
- Settlement evidence is never inferred from a pending or simulated payment.

## Merchant WebMCP tools

| Tool | Capability | Payment authority |
| --- | --- | --- |
| `list_agent_products` | Read the catalog and public terms | None |
| `prepare_agent_purchase` | Return the protected HTTP 402 purchase URL | None |
| `get_agent_purchase_receipt` | Retrieve sanitized delivery evidence | None |

The reference surface is `/agent-commerce.html` in Merchant Lab. Chrome without
WebMCP support still renders the human-readable journey as progressive enhancement.

## Expansion model

Digital resources remain the first end-to-end acceptance vertical. Physical goods,
mobility, food delivery and subscriptions plug in through merchant connectors that
must normalize catalog, order, fulfillment and refund states. Existing marketplace
checkout and payment rails remain authoritative until a marketplace explicitly
accepts an agent-native settlement method.

Escrow is a settlement strategy, not the universal default. Use direct settlement
for immediately delivered digital resources; use authorization/capture, escrow or
merchant-controlled refunds when fulfillment is delayed or disputable.
