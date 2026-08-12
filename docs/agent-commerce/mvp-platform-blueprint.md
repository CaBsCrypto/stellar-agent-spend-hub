# Agent Commerce Platform — MVP Blueprint

## One sentence

Agent Commerce is a non-custodial control and integration layer that lets an AI
agent discover an economic action, prepare it, enforce the user's policy, request
an external wallet signature, verify execution, and retain a privacy-safe receipt.

## What the MVP proves

One user can use one policy and approval experience across three different kinds
of economic action:

1. **DeFindex:** prepare and execute a vault deposit on Stellar testnet.
2. **Innovation space:** reserve a real-world day pass or room and check in.
3. **Task marketplace:** publish a scoped digital task and record its delivery.

Travala is the first global discovery connector. Until a public sandbox or partner
test environment exists, hotel search and package preparation are real while paid
booking remains disabled in the public demo.

## Product boundary

The platform stores intent, policy decisions, orders, execution references,
fulfillment events, and receipts. It does not store customer funds or unrestricted
private keys. Wallets and regulated payment providers remain the signing and
settlement authorities.

## Common transaction model

Every connector normalizes its flow to:

```text
Intent -> Candidate -> Quote -> Agreement -> Policy decision
       -> Human authorization -> External execution
       -> Verification -> Fulfillment -> Receipt
```

The first implementation needs these records:

| Record | Purpose |
| --- | --- |
| `Actor` | User, agent, merchant, provider, or worker identity |
| `Intent` | What the user asked to accomplish |
| `Candidate` | Offer, vault, hotel, workspace, or proposal |
| `Quote` | Immutable amount, asset, terms, expiry, and source |
| `Agreement` | Order, reservation, allocation, or work agreement |
| `PolicyDecision` | Allowed/blocked reasons and applicable limits |
| `Authorization` | Exact user-approved action and expiration |
| `Execution` | Wallet/provider reference and verified state |
| `Fulfillment` | Deposit position, check-in, or digital delivery evidence |
| `Receipt` | Sanitized end-to-end audit record |

## Required safety invariants

- A connector can prepare but cannot sign on behalf of the user.
- An authorization binds provider, action, amount, asset, network, recipient,
  expiry, and a hash of the immutable quote.
- The same idempotency key cannot produce two economic executions.
- `simulated`, `submitted`, `settled`, and `fulfilled` are distinct states.
- Provider output and merchant metadata are untrusted until validated.
- Sensitive wallet material, API keys, personal data, and access tokens never
  appear in public receipts.
- Financial actions require stricter confirmation than free reservations.
- Delayed fulfillment never implies that Agent Commerce holds the funds.

## MVP connectors

### DeFindex — build first

Real in MVP: API access, testnet vault lookup, unsigned XDR construction,
human-readable transaction review, Freighter signature, testnet submission,
on-chain verification, idempotency, and receipt.

Blocked until supplied by partner: API key, recommended testnet vault, supported
test asset, and permission to identify the integration publicly.

### Innovation space — build second

Real in MVP: merchant profile, offer, manually managed availability, reservation,
confirmation, QR/OTP check-in, fulfillment receipt, and optional testnet deposit.

The space remains the service provider. Agent Commerce neither becomes merchant
of record nor receives the booking funds.

### Task marketplace — build third

Real in MVP: task brief, budget, publication through partner API, proposals,
selection, agreement, delivery reference, accept/dispute state, and receipt.

Initial payment occurs directly after acceptance. Production escrow is out of
scope until a regulated provider or reviewed contract is selected.

### Travala — global connector

Real in MVP: remote MCP connection, hotel search, package comparison, budget
impact, and prepared booking. The `book` action is disabled in demos unless
Travala supplies a sandbox or explicitly approves a controlled live transaction.

## Build sequence and exit criteria

### Milestone 0 — freeze contract

- Approve this common model and non-custodial boundary.
- Publish the pilot manifest and intake form.
- Mark every connector capability as real, simulated, blocked, or planned.

Exit: no pilot needs a new core transaction model.

### Milestone 1 — DeFindex supervised testnet

- Replace the placeholder adapter with an API-backed implementation.
- Simulate and decode XDR before presenting it.
- Require a Freighter signature.
- Verify the transaction independently on Stellar.
- Replay the same request and prove no second deposit occurs.

Exit: reproducible testnet hash, one balance/position change, replay rejected.

### Milestone 2 — IRL reservation

- Create one day-pass offer.
- Load availability manually.
- Complete reservation and supervised testnet deposit.
- Validate check-in with one-time code.

Exit: one real person completes a real visit and both parties confirm the receipt.

### Milestone 3 — digital task

- Publish one real task through the partner.
- Record one proposal, selection, delivery, and acceptance/dispute decision.
- Execute direct testnet payment after acceptance if supported.

Exit: one real task reaches a terminal state with evidence.

### Milestone 4 — unified agent demo

- Use one policy dashboard across all three connectors.
- Add Travala search in dry-run mode.
- Record a 90-second demo with truthful status labels.

Exit: an external tester can reproduce the flow from written instructions.

## Not in the MVP

- Custody, pooled balances, or unrestricted server signing.
- Production investment advice or autonomous yield allocation.
- Production escrow or dispute arbitration.
- Physical-goods logistics.
- Automatic website scanner and mass merchant migration.
- Mainnet payments performed for demonstration purposes.

## YC evidence target

- 1 reproducible DeFindex testnet execution.
- 1 real innovation-space reservation fulfilled.
- 1 real digital task published and completed or in active pilot.
- 3 signed pilot acceptance letters.
- 10 customer/partner interviews.
- 1 public 90-second demo and one architecture diagram.

