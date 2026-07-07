# Sprint 10: Contract Account + Passkey

## Status

Implemented and verified:

- `SpendAccountV1` implements Soroban `CustomAccountInterface::__check_auth`.
- Owner authentication verifies WebAuthn challenge, origin, RP ID and low-S
  secp256r1 signatures.
- Agent authentication verifies Ed25519 signatures and permits only allowlisted
  USDC SAC transfers.
- Policy enforces one merchant, `0.01 USDC` per payment, `0.02 USDC` total,
  expiry, revoke and cumulative spend.
- Vercel relayer builds canonical calls, prepares auth entries, enforces a
  `1 XLM` testnet fee cap, re-simulates signed entries and submits only on testnet.
- Upstash provides ten-minute requests, atomic consumption, rate limiting and
  30-day sanitized receipts.
- Public registration is handed to Upstash through a ten-minute ceremony and can be claimed once by the admin deploy endpoint.
- The fixture E2E has verified deploy, funding, passkey-compatible grant, `0.01 USDC` session payment and revoke.
- Browser registration keeps the credential ID locally and sends only public
  WebAuthn evidence.
- The local agent signs with `spendhub-session`; its secret never enters Vercel.

## Public Evidence

| Field | Value |
| --- | --- |
| Contract tests | `6/6` |
| App tests | `176/176` total |
| All Rust tests | `31/31` |
| Wasm hash | `6230e90601a82fd1afd8ae3dd59da55a4bc66d5e1fd4603996b1466f88c3c800` |
| Wasm upload | [`e03bcebf...8d80`](https://stellar.expert/explorer/testnet/tx/e03bcebf3ba684d4cff805cd2f990722e92c07881e159a13d93f6204b8aa8d80) |
| Merchant | `GAJK6AKXWGMRNRNZRLPZ5J7MUT4X7TZWHPEFEJJ5TL7V7XWPYKGG2CNV` |
| Relayer | `GD2HWVSSD5I64HD5LCPCXW6NKSJLQRSL5V4OGBOIDRDCXM4VZRJBBKC6` |
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

Merchant has a testnet USDC trustline. Relayer deliberately has no USDC
trustline and only pays XLM fees.

## Remaining Acceptance Gates

1. Create the production-domain passkey with human biometric confirmation.
2. Consume the one-time ceremony and deploy the human-owned contract instance.
3. Fund the account with `0.02 USDC` testnet.
4. Execute the passkey grant and one session payment, then publish the hash and close all gates.

No mainnet funds, raw credential IDs, private keys or PII are part of this
evidence.
