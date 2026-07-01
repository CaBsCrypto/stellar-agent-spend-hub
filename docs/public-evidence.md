# Public Evidence Contract

## Canonical source

The live manifest at <https://agente-pagos-stellar.vercel.app/api/evidence> is the source of truth. A frozen submission snapshot is generated only after both payments, replay rejection, passkey revoke, and closed gates are verified.

## Coordinated proofs

| Proof | Amount | Hash | Status |
| --- | ---: | --- | --- |
| Official Stellar MPP Charge | `0.01 USDC` | `8290da7e4da419d824f49da6a8ad21fb7e5117cccf861c923dc21e299e985836` | verified |
| Passkey-managed Contract Account | `0.01 USDC` | `b37ab9217c108b023abcb3905d4fee98d32999b23d800c9471f82aeb646af094` | verified |

## Public schema

Evidence items expose status, type, network, asset, human amount, policy, transaction hash, explorer URL, and verification time. Contract Account transfers additionally expose `amountBaseUnits`.

`contractAccountLifecycle` exposes only public acceptance data:

- contract ID and USDC SAC;
- deploy, funding, grant, payment, and revoke proofs;
- first submit `200` and replay submit `409`;
- whether submission gates are closed.

## Invariants

- Pending evidence cannot include a hash, explorer URL, or verification time.
- Verified evidence requires all three proof fields.
- The coordinated Contract Account proof always points to the payment, never the grant.
- `amount="0.01"` and `amountBaseUnits="100000"` cannot be conflated.
- Replay mode always returns `executionAllowed=false`.
- Public payloads cannot contain secrets, signatures, full XDR, credential IDs, PII, or customer references.

These invariants are enforced in code and tests. Documentation edits cannot promote runtime evidence.