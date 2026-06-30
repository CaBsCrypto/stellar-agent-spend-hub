# Threat Model: Stellar Agent Spend Hub

## Protected assets

- User-controlled USDC and XLM.
- Passkey credential and local credential identifier.
- Session signer secret.
- Relayer and MPP server secrets.
- Payment authorization entries and ten-minute prepared requests.
- Ten-minute passkey deployment ceremonies containing public registration hashes only.
- Receipts and evidence that must remain free of PII.

## Trust boundaries

| Boundary | Trusted responsibility | Must never receive |
| --- | --- | --- |
| Browser | WebAuthn ceremony and human confirmation | Relayer or session secret |
| Vercel API | Canonical request construction and fee payment | Raw credential ID or arbitrary transaction XDR |
| Upstash | Atomic request state, replay protection and sanitized receipts | Private keys, signatures or customer identifiers |
| Contract account | On-chain policy and authentication enforcement | Off-chain PII or provider secrets |
| Local buyer/agent | MPP or session signing | Vercel production secrets |

## Primary threats and controls

| Threat | Control |
| --- | --- |
| Arbitrary relayer transaction | Server reconstructs calls from allowlisted parameters and rejects XDR input |
| Stolen session signer | Merchant, asset, amount, total budget and 24-hour expiry enforced on-chain |
| Ceremony substitution or replay | Production RP/origin hashes, explicit ceremony UUID, atomic one-time claim and ten-minute TTL |
| Replay or concurrent submit | Soroban auth nonce plus atomic Upstash request consumption |
| Malicious WebAuthn assertion | Challenge, origin, RP ID, credential hash and low-S P-256 verification |
| Mainnet or asset substitution | Testnet and USDC SAC constants validated before simulation |
| Excessive relayer fees | Hard testnet cap of `1 XLM`; observed grant simulation requires about `0.864 XLM` |
| Receipt or log leakage | PII guard, sanitized receipts and no signatures/full XDR in responses |
| Fake demo evidence | Pending state has no hash; verified state requires a public transaction hash |
| Replay demo moving funds | Evidence endpoints are GET-only and always return `executionAllowed: false` |

## Residual risks

- The contracts and relayer have not received an external security audit.
- Vercel and Upstash are trusted infrastructure providers for the testnet demo.
- Browser/device compromise can still affect human authorization.
- Production recovery, signer rotation and multi-device passkeys are not implemented.
- LatAm bill pay remains out of scope until privacy, legal and partner controls mature.

## Incident defaults

1. Close deploy, submit and MPP gates.
2. Revoke the active session from the owner passkey.
3. Stop funding the contract account and revoke the active session.
4. Rotate relayer and server secrets in Vercel.
5. Preserve only sanitized public hashes for investigation.
