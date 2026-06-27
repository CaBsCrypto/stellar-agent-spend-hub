# Spend Hub Provider Kit

`paid-node-api.mjs` demonstrates the production integration path:

1. Build the official `@stellar/mpp` Charge runtime.
2. Use the atomic Upstash-backed MPP store.
3. Validate a `ProviderDefinition`.
4. Return the SDK's native `402` challenge unchanged.
5. Load the resource only after settlement.
6. Attach the SDK's native payment receipt to the response.

Required server-side variables:

- `MPP_SECRET_KEY`
- `MPP_STELLAR_RECIPIENT`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The example is testnet-only and charges at most `0.01 USDC`. Do not place
private keys, payment signatures, customer identifiers, or full XDR in logs or
public receipts.
