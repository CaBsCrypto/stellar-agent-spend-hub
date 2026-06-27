# Provider Kit V1

Provider Kit lets a Node API or MCP tool charge through the official Stellar
MPP Charge flow while preserving Spend Hub's privacy and policy constraints.

## ProviderDefinition

```json
{
  "version": "spendhub-provider-v1",
  "providerId": "stellar-risk-api",
  "name": "Stellar Risk API",
  "endpoint": "/api/mpp/stellar-risk",
  "resource": "Horizon-backed transaction heuristic report",
  "maxPrice": "0.01",
  "asset": "USDC",
  "assetContractId": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  "network": "stellar:testnet",
  "legalContextUrl": null,
  "privacyRequirements": [
    "no-pii-receipts",
    "no-secrets-in-metadata",
    "human-confirmation-v1"
  ]
}
```

## Flow

1. Validate the provider definition.
2. Precompute the resource or verify that it exists before charging.
3. Return the official MPP SDK challenge unchanged.
4. Load or deliver the resource only after settlement.
5. Attach the official MPP receipt.
6. Persist only the sanitized public receipt.

The complete example is in
[`examples/provider-kit/paid-node-api.mjs`](../examples/provider-kit/paid-node-api.mjs).

## Public endpoints

- `GET /api/provider-kit/definition`
- `POST /api/provider-kit/validate`
- `GET /api/mpp/stellar-risk?tx=<64-hex>`

Provider Kit V1 rejects mainnet, non-USDC assets, HTTP provider URLs, prices over
`0.01 USDC`, unknown privacy requirements and responses containing PII.
