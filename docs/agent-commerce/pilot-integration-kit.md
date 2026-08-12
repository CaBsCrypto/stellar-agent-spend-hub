# Pilot Integration Kit

This kit is the shared onboarding contract for financial protocols, merchants,
marketplaces, and MCP providers. A partner starts with the smallest integration
that can prove one safe action.

## Integration paths

1. **Hosted offer:** Agent Commerce hosts the offer and availability.
2. **Import/feed:** CSV, JSON, or an authorized catalog feed is synchronized.
3. **Web surface:** WebMCP or the Agent Commerce SDK augments an existing page.
4. **Remote connector:** an API or MCP server remains the source of truth.
5. **Enterprise:** custom identity, inventory, payment, and fulfillment systems.

## Minimum pilot manifest

```json
{
  "manifestVersion": "agent-commerce-pilot-v1",
  "pilotId": "partner-action-testnet",
  "partner": {
    "name": "Partner name",
    "type": "merchant"
  },
  "environment": "testnet",
  "connector": {
    "kind": "api",
    "baseUrl": "https://partner.example/api",
    "sourceOfTruth": "partner"
  },
  "actions": [
    {
      "actionId": "reserve_day_pass",
      "riskClass": "service_reservation",
      "requiresHumanConfirmation": true,
      "payment": "optional",
      "fulfillment": "otp_check_in"
    }
  ],
  "wallet": {
    "custody": "external",
    "signer": "freighter",
    "network": "stellar:testnet"
  },
  "data": {
    "containsPersonalData": true,
    "publicReceiptFields": ["pilotId", "actionId", "status", "executedAt"]
  },
  "claims": {
    "real": ["offer", "reservation"],
    "simulated": ["economic_value"],
    "blocked": [],
    "planned": ["production_payment"]
  }
}
```

## Partner intake

### Business and ownership

- Legal/project name and public URL.
- Technical and business contacts.
- Who owns the catalog, API, contracts, and customer relationship?
- May the partner name and logo appear in the demo?

### First action

- What is the single action we will prove?
- What information is required before executing it?
- What makes it irreversible or economically meaningful?
- What is the cancellation or failure path?

### Environment and authentication

- Sandbox/testnet URL and credentials.
- API, MCP, SDK, webhook, feed, or manual source.
- Rate limits and retry requirements.
- Test accounts, vaults, products, calendars, or tasks.

### Money and signing

- Is payment required, optional, delayed, or external?
- Network, asset, recipient, fee, and minimum amount.
- Who signs and who settles?
- Can a transaction be simulated before signing?
- How are refunds or reversals handled?

### Fulfillment and evidence

- What proves success?
- Who can confirm fulfillment?
- Which identifiers can appear in a private receipt?
- Which sanitized fields may be public?
- How are disputes represented?

### Security and compliance

- Personal or sensitive data involved.
- Restricted countries, users, assets, or categories.
- Required disclosures and explicit confirmations.
- Known audits, incident contacts, and revocation process.

## Technical acceptance checklist

- [ ] Connector validates all untrusted provider responses.
- [ ] Secrets are server-side and absent from logs/receipts.
- [ ] Quote/action has a stable hash and expiration.
- [ ] Human approval shows exact economic consequences.
- [ ] Signing authority is external to Agent Commerce.
- [ ] Idempotency is persisted atomically.
- [ ] Execution is independently verified.
- [ ] Replay and expired authorization tests pass.
- [ ] Failure and cancellation paths are demonstrated.
- [ ] Real/simulated status is visible in the UI.
- [ ] Partner approves the public demo wording.

## Pilot stages

| Stage | Meaning | Required evidence |
| --- | --- | --- |
| Interested | Partner agrees to explore | Named contact and meeting |
| Accepted | Partner authorizes a bounded pilot | Signed letter/email and pilot action |
| Integrated | Connector works in sandbox/testnet | Repeatable test and logs |
| Live pilot | A real user completes the action | Partner-confirmed receipt |
| Production | Legal, security, and operations approved | Separate production agreement |

