# Spend Account V1

Soroban contract account for the Sprint 10 testnet demo.

- Passkey owner: WebAuthn challenge, origin, RP ID and secp256r1 verification.
- Agent session: Ed25519 signer restricted to an allowlisted SAC transfer policy.
- Default demo policy: testnet USDC, one merchant, `0.01 USDC` per payment,
  `0.02 USDC` total budget and 24-hour expiry.
- The Stellar authorization-entry nonce provides replay protection.

This contract is testnet-only and unaudited. It is not a mainnet wallet.
