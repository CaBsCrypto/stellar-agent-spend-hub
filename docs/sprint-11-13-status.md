# Sprint 11-13 Status

## Completed

- Restored `https://agente-pagos-stellar.vercel.app`.
- Provisioned `upstash-kv-cinnabar-compass` through Vercel Marketplace.
- Added compatibility for both direct Upstash and Vercel KV environment names.
- Configured MPP and Contract Account server secrets as sensitive Vercel variables.
- Kept `MPP_ENABLED`, deploy and submit gates closed.
- Added explicit Vercel entrypoints for all nested API routes.
- Added public Evidence API, dependency diagnostics and Live/Replay modes.
- Added Provider Kit V1, an official MPP integration example and validation API.
- Added SCF milestones, threat model, demo script and partner shortlist.
- Verified production at desktop and mobile widths with no horizontal overflow.

## Production endpoints

- `GET /api/evidence`
- `GET /api/diagnostics/public`
- `GET /api/provider-kit/definition`
- `POST /api/provider-kit/validate`
- `GET /api/mpp/stellar-risk?tx=<64-hex>`
- `GET /api/contract-account/status`

## Production MPP challenge evidence

On `2026-06-27`, the production Stellar Risk API returned an official MPP
`402 Payment Required` challenge with:

- amount: `100000` base units (`0.01 USDC`);
- network: `stellar:testnet`;
- asset: testnet USDC SAC;
- recipient: `GAJK6AKXWGMRNRNZRLPZ5J7MUT4X7TZWHPEFEJJ5TL7V7XWPYKGG2CNV`;
- replay store: reachable Upstash Marketplace KV.

The gate was closed in a `finally` block and the endpoint returned `503`
afterward. This is challenge evidence, not a settlement receipt.
## Pending supervised acceptance

1. Circle Faucet must fund `spendhub-owner` with Stellar testnet USDC.
2. Temporarily enable MPP, deploy, execute one `0.01 USDC` Charge and verify replay rejection.
3. Register the production-domain passkey.
4. Deploy Spend Account V1 using the public WebAuthn registration values.
5. Fund the contract with `0.02 USDC`, grant the session and execute `0.01 USDC`.
6. Execute one minimal Escrow V2 transfer and stop funding the legacy contract.
7. Publish the new hashes and return every gate to `false`.

Current owner and merchant USDC balances were both `0.0000000` at the last
check, so no settlement hash has been fabricated.
