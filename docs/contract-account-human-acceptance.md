# Human Passkey Contract Account Acceptance

Status: frozen and verified. Payment, replay rejection, owner revoke, and closed gates confirmed.

## Public lifecycle

| Step | Result | Public proof |
| --- | --- | --- |
| Deploy | SUCCESS, ledger `3365645` | `c3d90c92ca4baeb926c899a229b64ef75c49e0f464217c46c770093df19b71f3` |
| Fund `0.02 USDC` | SUCCESS, ledger `3365681` | `c02c6c935881d4acdc178af3d66477b65c9b8f626a69db3c1afa1dc4719d41f4` |
| Passkey grant | SUCCESS, ledger `3365911` | `46de0acb3fa8b62eb99bef2950f5564d0fb505eb3cfe036210482f8e23e78e9b` |
| Session payment `0.01 USDC` | SUCCESS, ledger `3367749` | `b37ab9217c108b023abcb3905d4fee98d32999b23d800c9471f82aeb646af094` |
| Identical replay | Rejected | HTTP `409`; no second balance movement |
| Owner revoke | SUCCESS, ledger `3370263` | `27010be282572c1fb8c5cd4762aac28588e61aed2d8f3317647f83bafbafc3cc` |

## Policy and balances

- Contract: `CASKG5OOMM2WH6RDCO7FX4XFP6T62SX22WXVTFPIIP2XKGXBHZ4L7HPO`.
- Asset: testnet USDC SAC.
- Destination: one allowlisted merchant.
- Per-payment limit: `0.01 USDC`.
- Total budget: `0.02 USDC`.
- Spent after payment: `0.01 USDC`.
- Contract balance after payment: `0.01 USDC`.
- Merchant balance after payment: `0.03 USDC`.

No private key, signature, full XDR, credential ID, or PII is included in this report.