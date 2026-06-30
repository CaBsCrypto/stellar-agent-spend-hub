# Contract Account Fixture E2E Result

Date: 2026-06-30
Network: Stellar testnet
Status: verified fixture; production passkey ceremony still pending

## Purpose

This run validates the complete Contract Account payment path before the human WebAuthn ceremony. It uses a deterministic P-256 test key that reproduces WebAuthn signatures but is not a user passkey and must never be presented as final SCF passkey evidence.

## Public evidence

| Step | Public result |
| --- | --- |
| Contract | `CBJ7KLCWOXXPOECHJD2BUW75KT37HBDVZVFTP2C75WSPKPOO7FSM3EBR` |
| Deploy | `d504af2a647d606cfe346c6aa290c2a65d375b4ec4b6adb7b5385d93a1bdfc3d` |
| Fund `0.02 USDC` | `83b8cfd90221f8ac0edb99e729b113c85f2fd2a41aaa8bc55ff9df3e0fcc9688` |
| Passkey-compatible grant | `4975207001617dcb341f08b38bb135b602d08f164f07d8dff5bb288b1550da40` |
| Session payment `0.01 USDC` | `43274c7974ef0653f91b64906bc09d929daffefebdaffaa34e25e39633e43f9a` |
| Owner revoke | `91353fd1083a5848162eba1ec326dc6ba571c3df99f3ff3312e18f3e1ff8d83a` |

Explorer base: `https://stellar.expert/explorer/testnet/tx/<hash>`.

## Verified state

- Merchant balance increased from `0.0100000` to `0.0200000 USDC`.
- Session destination is the configured merchant only.
- Session asset is the official testnet USDC SAC only.
- Per-payment limit is `0.01 USDC`.
- Total budget is `0.02 USDC`.
- Recorded spend is `0.01 USDC`.
- Session is revoked after the test.
- Contract retains `0.01 USDC`; the revoked session cannot spend it.

## Runtime defects found and fixed

1. Funding used `--send no`; it now explicitly submits with `--send yes`.
2. Stellar CLI network configuration could omit the passphrase; commands now pin RPC URL and testnet passphrase.
3. Stellar SDK `signAndSend` doubled the simulated resource fee and exceeded XDR `u32`; deployment now signs and sends the already assembled transaction once with a testnet cap.
4. Auth insertion spread an XDR operation and removed its methods; the signed auth entry now uses the native `InvokeHostFunctionOp.auth` setter.
5. The relayer rate limiter existed but was not attached; it is now initialized in the runtime constructor.
6. The old `0.1 XLM` relayer cap blocked a measured `0.8637113 XLM` grant simulation; the testnet cap is now `1 XLM` and remains deny-by-default above that value.

## Remaining acceptance gate

Repeat deploy, fund, grant and payment with a real production-domain passkey. Only that second run may change the coordinated Contract Account evidence from `pending` to `verified`.
