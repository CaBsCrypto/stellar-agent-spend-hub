# Public Evidence Contract

## Canonical source

The live manifest at <https://agente-pagos-stellar.vercel.app/api/evidence> is the public source of truth for settlement status. `src/publicEvidenceCatalog.mjs` owns immutable verified foundations and pending coordinated-proof definitions. Runtime receipts can promote a coordinated proof only after a real settlement is stored.

## Public fields

Every evidence item exposes:

- `id` and human-readable `label`;
- `verificationStatus`: `pending` or `verified`;
- `evidenceType`;
- compatibility aliases `status` and `kind`;
- `network`, `asset`, and `amount`;
- a privacy-safe `policy` summary;
- `transactionHash`, `explorerUrl`, and `verifiedAt` only when verified.

A contract-account item may additionally expose its public contract ID, destination, signer type, and policy decision. An MPP item may expose its protocol, recipient, and public asset contract ID.

## Invariants

- `pending` evidence must have `transactionHash=null`, `explorerUrl=null`, and `verifiedAt=null`.
- `verified` evidence must include all three proof fields.
- `status` must equal `verificationStatus`.
- `kind` must equal `evidenceType`.
- Replay mode always returns `executionAllowed=false`.
- Public payloads cannot contain private keys, signatures, full XDR, credential IDs, tokens, PII, or customer references.

These invariants are enforced at manifest construction time and covered by JavaScript tests.

## Verified foundations

| Evidence | Asset | Hash | Verified at |
| --- | --- | --- | --- |
| Direct Stellar payment | XLM | `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb` | `2026-06-26T02:17:02Z` |
| Policy-controlled SAC transfer | XLM | `8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f` | `2026-06-26T07:44:24Z` |
| Guarded runtime settlement | XLM | `cb9bf9fcef3a79d045285b9c82a2633d8e78f36e9625fd6fb46ab799aae7152e` | `2026-06-26T23:06:16Z` |

## Coordinated submission proofs

- Official MPP Stellar Charge: pending supervised `0.01 USDC` settlement.
- Passkey-managed Contract Account: pending supervised `0.01 USDC` settlement.

Neither item becomes verified by editing documentation. Only a validated runtime receipt can publish the settlement fields.