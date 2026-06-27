# Policy Escrow V2

Soroban testnet contract for bounded agent spending. This is a policy escrow, not yet a passkey contract account.

## Controls

- Atomic owner constructor.
- Session signer authentication.
- Destination and asset must both be allowlisted.
- Positive amount and per-payment limit.
- Cumulative session budget with tracked spend.
- Exact monotonic nonce.
- Expiry and revocation.
- Hashed payment reference in events.
- Owner-only recovery and TTL extension.

`providerId` is intentionally absent from authorization. A provider name supplied by an agent is not cryptographic evidence of the destination.

## Local QA

```powershell
npm run escrow-v2:test
npm run escrow-v2:build
npm run escrow-v2:plan
```

Expected Wasm path:

```text
target/wasm32v1-none/release/policy_escrow_v2.wasm
```

## Testnet Sequence

Configure only public IDs in the process environment, keep Stellar identities in the local CLI, and use fresh values for expiry, nonce, and payment reference.

```powershell
npm run escrow-v2:deploy
npm run escrow-v2:deploy:execute
npm run escrow-v2:grant:execute
npm run escrow-v2:fund:execute
npm run escrow-v2:transfer:execute
npm run escrow-v2:read:execute
```

The owner account must have the official testnet USDC trustline and faucet balance before funding. Sprint 09 uses:

```text
USDC SAC testnet: CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
```

Do not fund the legacy Sprint 06 contract again.

