# Sprint 05 Result: Soroban Smart Wallet Testnet Proof

## Summary

Completed: the Soroban Smart Wallet MVP was deployed and invoked on Stellar testnet using local Stellar CLI identities. No mainnet funds were used and no seed phrases, secret keys, tokens, PII, or raw customer identifiers were stored in this document.

The proof validates the product thesis in code:

```text
owner initializes wallet -> owner grants session signer -> session signer executes only within policy -> session can be read publicly
```

## Public Evidence

| Field | Value |
| --- | --- |
| Contract ID | `CAVI7DRQOWYNH2DD6DF53LXGCFEORVVEVWKZCCR3TCAHZLNRSQNONCYQ` |
| Lab | `https://lab.stellar.org/r/testnet/contract/CAVI7DRQOWYNH2DD6DF53LXGCFEORVVEVWKZCCR3TCAHZLNRSQNONCYQ` |
| Wasm hash | `ee18eba064eb03153c91b1e9122efee542b7d59b372d2e8adf91f87da1b725db` |
| Owner public key | `GDULMCYXQ523T5N763JVI2HGM2UQJQ42SEIH74DKPSFGJ7F37IPXLOBI` |
| Session public key | `GDH7VT4AVZ33E4EI3WVGKABOJNJOGB2J463AAY677IFSCTPB35KYZKLU` |
| Provider allowlist | `api-mcp` |
| Per-payment limit | `1` |
| Destination allowlist | session public key |
| Network | Stellar testnet / Soroban RPC |

## Transactions

| Step | Transaction |
| --- | --- |
| Upload WASM | `https://stellar.expert/explorer/testnet/tx/284ae56da0546276700d031d2f81ce9f13b4a8294968ab7448145fae4e08581d` |
| Deploy contract | `https://stellar.expert/explorer/testnet/tx/04a9ef59ea93c028b26b2ac3885a74db9229d5584e08019dbfe6542ec1f70a2a` |
| Init owner | `https://stellar.expert/explorer/testnet/tx/03804ab26c0d78900caaeba99b2d734abcb3ff54622006bd2d4fb24bfef65fa5` |
| Grant session | `https://stellar.expert/explorer/testnet/tx/fb4a45e680abdfe41917b79275e977c251a311923f15d85a2326df5ad925cef1` |
| Execute allowed payment | `https://stellar.expert/explorer/testnet/tx/c1d10a147ec9ad8c97f16675354eb8f8a7375c9aeba6a01d371402014d9aaf87` |

## Verified Behavior

- `init` succeeded with owner auth.
- `grant_session` succeeded from owner identity.
- `execute_allowed_payment` succeeded from session identity.
- Contract emitted `PaymentExecutedEvent` with provider `api-mcp`, amount `1`, nonce `1`.
- `read_session` returned the active policy with `revoked: false`.
- The script reports were scanned through the project sensitive-data guard.

## Lessons

- Stellar CLI v26 vector arguments must be valid JSON, for example `["api-mcp"]`.
- The first redaction pass was too broad for public keys containing `S`; it now redacts only full Stellar secret-key shaped strings.
- The current proof is a permission execution proof, not a SAC/USDC transfer.

## Next

Sprint 06 should integrate a Stellar Asset Contract transfer path behind the same permission checks and keep a dry-run/confirmation gate before any real asset movement.
