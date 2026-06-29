# MCP Agent Payment Control Plane

## Purpose

The local MCP server lets an AI agent discover providers, create an idempotent payment intent, prepare a Stellar testnet payment, and observe status or a sanitized receipt. It deliberately cannot settle funds.

The human approval boundary remains the Spend Hub UI:

`MCP agent -> create -> prepare -> /spend confirmation -> policy-controlled rail -> public receipt`

## Official SDK

The server uses `@modelcontextprotocol/sdk` v1 with `McpServer`, Zod input schemas, and `StdioServerTransport`. The protocol SDK handles initialization, capability negotiation, tool validation, and structured tool errors.

Run locally:

```powershell
npm run mcp:serve
```

Optional configuration:

- `MCP_STATE_PATH`: shared local runtime state; defaults to `data/runtime-state.json`.
- `MCP_APP_BASE_URL`: approval-link origin; defaults to `http://localhost:4179`.

No signing key or submit token is required by the MCP server.

## Tools

| Tool | Side effect | Result |
| --- | --- | --- |
| `discover_providers` | None | Structured Provider Definitions |
| `create_payment_intent` | Local intent only | Policy decision and approval URL |
| `prepare_payment` | Local lifecycle update | Stellar preview with `canSubmit=false` |
| `get_payment_status` | None | Intent, policy, confirmation, settlement |
| `get_receipt` | None | Sanitized public receipt |

There is intentionally no `execute_payment` tool in v1. A model-provided boolean such as `humanConfirmed=true` is not accepted as human authorization.

## Security invariants

- Maximum MCP demo amount is `0.01 USDC`.
- Intent creation requires an idempotency key.
- Every payment reports `requiresConfirmation=true`.
- MCP responses pass through the sensitive-data firewall.
- Unknown internal failures return a generic public error.
- Settlement uses the existing Spend Hub approval path and payment runtime.
- Mainnet, autopilot, private keys, arbitrary XDR, and browser signing are unavailable.

## Verification

```powershell
npm run mcp:test
npm test
```

The integration tests use the SDK's linked in-memory transport, so they verify real MCP initialization, discovery, schemas, tool calls, structured results, idempotency, confirmation boundaries, and errors without spawning a fragile child process.

## Next milestone

After the two coordinated USDC proofs are verified, expose the same tool service through authenticated MCP Streamable HTTP for one sandbox design partner. Remote execution remains out of scope until authorization, rate limiting, tenant isolation, and an external security review are complete.
