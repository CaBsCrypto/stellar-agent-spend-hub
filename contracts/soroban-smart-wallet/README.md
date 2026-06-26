# Soroban Smart Wallet Contract

Sprint 04 turns the Sprint 03 adapter scaffold into a compilable Soroban Rust contract. The contract does not move SAC/USDC yet; it proves the permission model that will guard agentic payments before real transfer integration.

## What the contract enforces

- `owner` initializes the wallet and controls session grants/revokes.
- `session_signer` can execute only within an active session.
- `allowed_destinations` and `allowed_providers` constrain where the agent can spend.
- `per_payment_limit` caps every execution.
- `expires_at` blocks stale sessions.
- `revoked` blocks a previously granted signer.
- `nonce` blocks replay.
- Execution emits a typed public `PaymentExecutedEvent` with no PII or secrets.

## Methods

```text
init(owner)
grant_session(owner_auth, session_signer, allowed_destinations, allowed_providers, per_payment_limit, expires_at)
revoke_session(owner_auth, session_signer)
execute_allowed_payment(session_signer, destination, amount, provider_id, nonce)
read_session(session_signer)
```

## Local QA

From the repo root:

```powershell
npm run contract:test
npm run contract:build
```

Equivalent raw commands:

```powershell
cargo test --manifest-path contracts/soroban-smart-wallet/Cargo.toml
stellar contract build --manifest-path contracts/soroban-smart-wallet/Cargo.toml
```

Current local result:

- Rust tests: `9/9` passing.
- Wasm file: `target\wasm32v1-none\release\soroban_smart_wallet.wasm`.
- Wasm hash: `ee18eba064eb03153c91b1e9122efee542b7d59b372d2e8adf91f87da1b725db`.
- Exported functions: `execute_allowed_payment`, `grant_session`, `init`, `read_session`, `revoke_session`.

## Testnet deploy runbook

Do not deploy to mainnet. Use testnet only after `npm run contract:test`, `npm run contract:build`, `npm run qa`, and secret audit pass.

```powershell
stellar network add testnet --rpc-url https://soroban-testnet.stellar.org --network-passphrase "Test SDF Network ; September 2015"
stellar network use testnet
stellar keys generate spendhub-owner --network testnet
stellar keys fund spendhub-owner --network testnet
stellar contract deploy --wasm target\wasm32v1-none\release\soroban_smart_wallet.wasm --source-account spendhub-owner --network testnet
```

After deploy, store only public values in env/docs:

```powershell
SOROBAN_SMART_WALLET_CONTRACT_ID=C...
SOROBAN_OWNER_PUBLIC_KEY=G...
SOROBAN_SESSION_PUBLIC_KEY=G...
```

Never commit seed phrases, secret keys, `.stellar`, `.soroban`, `.env`, or CLI credential output.

## Next step

Sprint 05 should integrate an actual Stellar Asset Contract transfer path after the permission contract is deployed and invoked successfully on testnet.