# Sprint 24: Base x402 Acceptance

## Goal

Produce the first real external-rail evidence without weakening the Stellar-first architecture:

`Privy user wallet -> x402 challenge -> 0.01 USDC on Base Sepolia -> verified resource and receipt`

The merchant key stays encrypted and local. Vercel receives only its public address.

## Current boundary

- `MULTICHAIN_ENABLED=false`
- `BASE_X402_ENABLED=false`
- Privy public identifiers not configured
- Base merchant not configured
- no Base settlement hash claimed

## 1. Create the merchant identity

Run in an interactive local terminal:

```powershell
npm run base:merchant:create
npm run base:merchant:verify
npm run base:merchant:address
```

The encrypted identity is stored under `.local-identities/`, which Git ignores. Back up the encrypted file and passphrase separately. Never place the private key, encrypted file or passphrase in Vercel.

## 2. Configure Privy

In the Privy dashboard:

- allow `https://agente-pagos-stellar.vercel.app`;
- allow the local development origin;
- enable email OTP and Google OAuth;
- enable an embedded Ethereum wallet;
- allow Base Sepolia and Avalanche Fuji.

Set only the public application identifiers in Vercel:

```text
PRIVY_APP_ID
PRIVY_CLIENT_ID
BASE_X402_MERCHANT_ADDRESS
```

Keep both execution gates closed and deploy. Then run:

```powershell
npm run base:acceptance:doctor
```

## 3. Fund and inspect

The Privy buyer wallet needs:

- Base Sepolia ETH for gas;
- more than `0.01 USDC` official Base Sepolia test token.

The merchant does not need a private key online to receive the payment.

## 4. Supervised acceptance

1. Verify the doctor reports configuration and infrastructure ready.
2. Temporarily set `MULTICHAIN_ENABLED=true`.
3. Temporarily set `BASE_X402_ENABLED=true`.
4. Deploy production.
5. Open `/treasury`.
6. Inspect a valid Base Sepolia transaction report.
7. Confirm exactly `0.01 USDC` in Privy.
8. Verify the USDC `Transfer` log, paid resource and receipt.
9. Retry the paid request and verify replay protection.
10. Set both gates back to `false` and deploy again.
11. Publish only addresses, amount, transaction hash and explorer URL.

## Acceptance criteria

- network is `eip155:84532`;
- token is official Base Sepolia USDC;
- amount is exactly `10000` base units;
- recipient equals the configured merchant;
- Privy signs only after human confirmation;
- the backend verifies the exact transfer log;
- receipt contains no email, token, signature or private material;
- all gates are closed after acceptance.
