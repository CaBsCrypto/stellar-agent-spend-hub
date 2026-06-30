# SCF USDC Acceptance Runbook

This is the supervised gate between a packaged application and an SCF submission. Do not execute it without Circle Faucet funding and the production-domain passkey ceremony.

## Preconditions

- Production alias is `https://agente-pagos-stellar.vercel.app`.
- `spendhub-owner` holds at least `0.03 USDC` testnet.
- Merchant trustline is active.
- Horizon, Soroban RPC, and Upstash diagnostics are reachable.
- `npm run qa:full` passes.
- All submit gates begin as `false`.

## Part A - MPP settlement

1. Confirm recipient, testnet USDC SAC, network, and exact maximum price `0.01 USDC`.
2. Temporarily set `MPP_ENABLED=true` and deploy production.
3. Run `npm run mpp:agent-risk -- --tx <verified-testnet-hash>` locally.
4. Review the challenge and type the interactive confirmation.
5. Confirm the API returns the resource and a sanitized receipt.
6. Verify the payment hash through Horizon or Stellar Expert.
7. Reuse the credential/request and confirm replay is rejected without a second debit.
8. Set `MPP_ENABLED=false`, deploy, and confirm the endpoint returns its disabled response.

## Part B - Contract Account settlement

1. Open the stable production `/wallet` route and register the passkey.
2. Confirm the URL now contains `?ceremony=<uuid>`; only public P-256 material is stored for ten minutes.
3. Inspect it with `npm run account:ceremony -- --ceremony=<uuid>`.
4. Temporarily set `CONTRACT_ACCOUNT_DEPLOY_ENABLED=true`.
5. Set `CONTRACT_ACCOUNT_DEPLOY_ADMIN_TOKEN` only in the local shell and run `npm run account:ceremony:deploy -- --ceremony=<uuid>`.
6. Record the public contract ID and deploy hash, then close the deploy gate and clear the local token.
7. Set `CONTRACT_ACCOUNT_ID` in Vercel and fund the C-account with exactly `0.02 USDC` testnet.
8. Temporarily enable the contract-account prepare/submit path.
9. Use the same passkey to grant the fixed Ed25519 session for 24 hours.
10. Execute one session payment of `0.01 USDC` to the configured merchant.
11. Verify merchant balance, public transaction hash, policy decision and sanitized receipt.
12. Confirm an invalid destination or repeated auth entry is rejected.
13. Set `CONTRACT_ACCOUNT_ENABLED=false`, `CONTRACT_ACCOUNT_SUBMIT_ENABLED=false`, and `CONTRACT_ACCOUNT_DEPLOY_ENABLED=false`; deploy again.

## Evidence publication

- Confirm `GET /api/evidence` changes each coordinated proof from `pending` to `verified` only after a stored receipt exists.
- Confirm each verified entry includes `verificationStatus`, `evidenceType`, `transactionHash`, `explorerUrl`, `verifiedAt`, `network`, `asset`, `amount`, and public policy.
- Update README, SCF application, demo script, screenshots, and final video.
- Do not manually insert a hash into pending evidence.

## Final submission gate

- Both USDC explorer links resolve and match merchant balances.
- Replay and policy rejection are recorded.
- All gates are closed.
- Secret audit, JavaScript/Rust tests, contract builds, Vercel build, production smoke test, and desktop/mobile browser QA pass.
- Only then mark the SCF package ready to submit.