# Sprint 21-23: Stellar-First Multichain Spend Hub

## Objective

Extend execution to provider-selected networks while keeping Stellar as the trust and policy anchor:

`Discover anywhere -> quote compatible rails -> human confirms -> settle on provider network -> verify`

Balances remain independent per network. A bridge is always a separate `BridgeIntent`; insufficient balance can suggest one but can never execute one.

## Implementation status

| Area | Status | Notes |
| --- | --- | --- |
| Stellar MPP and Contract Account | Verified | Existing SCF evidence remains frozen |
| Chain and Rail registries | Implemented | Stellar testnet, Base Sepolia, Avalanche Fuji |
| ProviderDefinition v2 | Implemented | Legacy v1 definitions normalize automatically |
| Deterministic routing | Implemented | Policy, balance, friction and Stellar tie-break |
| Exact token amounts | Implemented | Decimal strings and `BigInt`; no on-chain `Number` conversion |
| Privy Vanilla JS | Implemented, configuration pending | Email OTP, Google OAuth, embedded EVM wallet |
| Base x402 paid API | Implemented, settlement pending | Exact `0.01 USDC`, x402 v2, Base Sepolia |
| CCTP Base to Stellar | Implemented, bridge pending | Exact `1 USDC`, Standard Transfer, Circle forwarding |
| Avalanche Fuji | Registry only | Wallet and CCTP metadata; submit hard-disabled |

No Base or CCTP transaction hash is claimed until a supervised testnet acceptance session verifies it.

## Public routes

- `GET /api/chains`
- `GET /api/treasury`
- `POST /api/intents/:id/quote`
- `POST /api/intents/:id/record-settlement`
- `GET /api/x402/base-risk?tx=<0x-hash>`
- `POST /api/bridges`
- `POST /api/bridges/:id/prepare`
- `POST /api/bridges/:id/record-burn`
- `GET /api/bridges/:id`
- `GET /api/multichain/evidence`

The browser UI lives at `/treasury`. Stellar wallet controls remain isolated at `/wallet`.

## Routing invariants

1. Provider, protocol, network and official USDC contract must match.
2. The network must be allowlisted and its submit gate open.
3. The balance is compared in base-unit strings.
4. The route remains subject to policy and human confirmation.
5. Stellar wins equal executable scores.
6. Avalanche cannot execute in this release.
7. A payment never triggers a bridge as a side effect.

## Base x402 acceptance

The paid endpoint validates the requested Base transaction before issuing a challenge. Its challenge is pinned to:

- network: `eip155:84532`;
- asset: official Base Sepolia USDC;
- amount: `10000` base units (`0.01 USDC`);
- recipient: `BASE_X402_MERCHANT_ADDRESS`;
- facilitator: `https://x402.org/facilitator` by default.

Privy signs only after the Treasury page verifies the network, token, amount and recipient. The backend verifies the exact USDC `Transfer` log before publishing evidence.

## CCTP acceptance

The bridge is fixed to Base Sepolia to Stellar testnet and exactly `1 USDC`.

`Prepare -> Approve -> Human Confirm -> Burn -> Attestation -> Forward -> Verify`

The CCTP adapter:

- targets the official testnet TokenMessenger;
- binds the burn sender to the prepared Privy wallet;
- uses the configured Stellar `CctpForwarder` as `mintRecipient` and `destinationCaller`;
- encodes the final Stellar G-account in hook data;
- converts six-decimal CCTP units to seven-decimal Stellar units exactly;
- never reports settlement until Circle returns a destination transaction hash.

## Gates

All are `false` outside supervised testnet acceptance:

```text
MULTICHAIN_ENABLED=false
BASE_X402_ENABLED=false
CCTP_ENABLED=false
CCTP_SUBMIT_ENABLED=false
AVALANCHE_SUBMIT_ENABLED=false
```

## Acceptance session

1. Configure the Privy app for production and localhost origins.
2. Create an offline Base Sepolia merchant identity and expose only its address.
3. Fund the embedded wallet with testnet ETH and Base Sepolia USDC.
4. Open `MULTICHAIN_ENABLED` and `BASE_X402_ENABLED`.
5. Inspect, approve and settle exactly `0.01 USDC`.
6. Verify the transfer log and public evidence, then close the x402 gate.
7. Configure the official Stellar `CctpForwarder` and a dedicated Stellar destination account with a USDC trustline.
8. Open CCTP gates and bridge exactly `1 USDC`.
9. Verify the burn, Circle message and Stellar receipt.
10. Close all gates and publish only sanitized hashes and addresses.

## References

- [Privy Core JS recipe](https://docs.privy.io/recipes/core-js)
- [x402 buyer quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- [x402 seller quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [Circle CCTP on Stellar](https://developers.circle.com/cctp/references/stellar)
- [CCTP supported chains and domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains)
