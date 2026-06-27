# Sprint 09: Official MPP Charge + Policy Escrow V2

## Status

Implemented locally:

- Official `@stellar/mpp` Charge seller for testnet USDC.
- Paid Stellar Risk API route at `/api/mpp/stellar-risk`.
- Local buyer CLI with challenge pinning and explicit human confirmation.
- Upstash-backed atomic CAS adapter for replay protection.
- Public, sanitized MPP receipt repository.
- Policy Escrow V2 with strict destination and asset authorization.
- USDC trustlines created for the testnet owner and session accounts.
- Policy Escrow V2 deployed to testnet and session policy granted/read successfully.

Pending external setup:

- Complete Circle Faucet reCAPTCHA and fund the local buyer/owner with testnet USDC.
- Reauthenticate Vercel CLI.
- Provision Upstash through Vercel Marketplace.
- Configure private MPP variables and execute the first real USDC Charge.
- Fund the deployed Escrow V2 and execute its one-base-unit USDC transfer.

## Verified Local Evidence

| Check | Result |
|---|---|
| Official MPP challenge | `stellar / charge` |
| Price | `100000` base units = `0.01 USDC` |
| Network | `stellar:testnet` |
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Policy Escrow V2 tests | `14/14` |
| Escrow V2 Wasm hash | `e69592e783afdbed768ed14fd1ad0d4d1f85cc7fbd6cb12a99f7ffec9a698d3c` |
| Escrow V2 contract | `CCNLNLFQ35CSO3QDTBXYKYGYIB4W7273AC7DTV653QOCOI46MPYZSQXH` |
| Upload transaction | [`05fdaf92...7f45`](https://stellar.expert/explorer/testnet/tx/05fdaf92080be5a10bfc525893e3a8c0460cdbbf2c48caf1e451c5b1effd7f45) |
| Deploy transaction | [`444971ea...035`](https://stellar.expert/explorer/testnet/tx/444971eaff2692e124e9936748156025463f5e4a7ce17f5de470ab1a8cdba035) |
| Grant transaction | [`e4d7c0eb...ab9c`](https://stellar.expert/explorer/testnet/tx/e4d7c0eb6d68526d4a850b831a7e8cc3e525d5e2fb33c19625b9842f9358ab9c) |
| App tests | `64` legacy + `9` Sprint 09 |

The challenge smoke test used the existing public Sprint 08 transaction as the analysis target. No payment or secret was required for the 402 response.

## Runtime Boundaries

- The buyer defaults to the local Stellar CLI identity `spendhub-owner`. `MPP_BUYER_SECRET` remains an optional local-only fallback and must never be placed in Vercel.
- Vercel hosts the seller and stores only `MPP_SECRET_KEY`, recipient configuration, and Upstash credentials.
- The seller uses exact price, network, asset, and recipient configuration.
- The buyer pins origin, recipient, testnet USDC, and maximum price before signing.
- The Risk API validates and caches the Horizon report before issuing a challenge.
- The legacy `receipt:<id>` route is disabled in production.
- MPP and Policy Escrow V2 remain separate proofs until Sprint 10 contract-account work.

## Acceptance Runbook

1. Fund the owner/buyer from the Circle Faucet after selecting Stellar Testnet.
2. Verify a positive USDC balance in Horizon.
3. Reauthenticate Vercel and provision Upstash from Marketplace.
4. Configure `MPP_ENABLED=false` plus all MPP/Upstash variables in Preview.
5. Deploy Preview and verify health, receipt list, and disabled seller behavior.
6. Set `MPP_ENABLED=true`, deploy Preview, and run the local buyer CLI against it.
7. Confirm `0.01 USDC`, receive the report, verify the transaction hash, and test replay rejection.
8. Fund the deployed Escrow V2 with one USDC base unit, execute nonce `1`, and verify the hash.
9. Record only public hashes and return every submit/admin gate to its closed state.

