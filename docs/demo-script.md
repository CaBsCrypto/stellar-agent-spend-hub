# 90-Second SCF Demo Script

## 0-12 seconds: The trust gap

AI agents can discover and use APIs, but broad wallet credentials create an unacceptable trust gap. Stellar Agent Spend Hub gives an agent bounded payment authority instead of custody.

## 12-32 seconds: Discover and authorize

Open the Provider Kit definition and Stellar Risk API. Show the exact `0.01 USDC` price, Stellar testnet asset, and merchant. The local buyer receives the official Stellar MPP `402` challenge and asks for human confirmation before signing.

## 32-47 seconds: MPP settle and verify

Open Live Evidence. Show the delivered report and the first coordinated USDC settlement. Follow its public explorer link, then explain that Upstash consumes the request atomically so replay cannot produce a second payment.

## 47-68 seconds: Contract Account policy

Show the passkey-owned Soroban Contract Account. Its agent session is limited to one merchant, testnet USDC, `0.01 USDC` per payment, `0.02 USDC` total, and 24 hours. Execute the second payment and open its explorer link. Show one blocked invalid destination or replay.

## 68-82 seconds: Privacy-safe evidence

Switch to Replay Demo. It is read-only and never signs or moves funds. Open `GET /api/evidence`: it contains verification status, network, asset, amount, public policy, timestamp, and transaction hashes, but no private keys, signatures, full XDR, credential IDs, or personal identifiers.

## 82-90 seconds: Why Stellar

Spend Hub combines official MPP interoperability, low-cost USDC settlement, and Soroban contract accounts. SCF funding will turn the proof into a reusable Provider Kit pilot, security-reviewed beta, and responsible mainnet readiness process.

## Recording gate

Do not record the final version until both coordinated USDC entries are `verified`. Use the stable production domain, preload explorer tabs, keep every submit gate closed outside the recorded acceptance actions, and never reveal terminal environment variables.