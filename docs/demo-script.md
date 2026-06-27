# 90-Second SCF Demo Script

## 0-15 seconds: Problem

AI agents can discover APIs, but payment credentials and unlimited wallets create
an unacceptable trust gap. Spend Hub gives an agent a bounded payment permission
instead of custody.

## 15-35 seconds: MPP interoperability

1. Open `Live Evidence`.
2. Request a Stellar Risk API report without credentials.
3. Show the official MPP `402` challenge for exactly `0.01 USDC`.
4. Run the local buyer with human confirmation.
5. Show the delivered report and public settlement link.

## 35-65 seconds: Programmable control

1. Show the passkey-owned Soroban Contract Account.
2. Grant the agent a 24-hour session.
3. Highlight fixed merchant, USDC asset, `0.01` per-payment limit and `0.02`
   cumulative budget.
4. Execute the agent payment and verify the second public transaction.
5. Show a blocked destination or replay attempt.

## 65-80 seconds: Privacy and auditability

Open `GET /api/evidence`. Show that it contains contract IDs, public keys,
amounts, policy decisions and hashes, but no private keys, signatures, XDR,
credential IDs or personal identifiers.

## 80-90 seconds: Why Stellar

Spend Hub combines open MPP payments, low-cost USDC settlement and Soroban
contract accounts. The next milestone is onboarding MCP/API providers through
the Provider Kit before expanding toward privacy-first LatAm bill pay.

## Recording checklist

- Use the stable production domain.
- Start with all submit gates closed.
- Never reveal terminal environment variables.
- Keep explorer tabs preloaded.
- Use Replay Demo after the two real settlements are recorded.
