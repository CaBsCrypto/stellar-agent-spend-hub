# SCF Acceptance and Evidence Freeze Runbook

## Verified payment evidence

- MPP `0.01 USDC`: `8290da7e4da419d824f49da6a8ad21fb7e5117cccf861c923dc21e299e985836`.
- Contract Account `0.01 USDC`: `b37ab9217c108b023abcb3905d4fee98d32999b23d800c9471f82aeb646af094`.
- First Contract Account submit returned `200`; identical replay returned `409`.
- Contract balance changed `0.02 -> 0.01 USDC`; merchant changed `0.02 -> 0.03 USDC`.

## Freeze procedure

1. Confirm both coordinated entries are `verified` in `GET /api/evidence`.
2. Have the passkey owner execute `Revoke` from `/wallet`.
3. Verify the revoke hash through Soroban RPC and confirm `session.revoked=true`.
4. Set deploy and submit gates to `false`, redeploy, and confirm public readiness is not submit-capable.
5. Run `npm run evidence:capture`; it must fail unless revoke is verified and gates are closed.
6. Run full QA, secret audit, explorer-link checks, and desktop/mobile browser verification.
7. Commit the frozen snapshot and acceptance report. Do not execute more payments from this Contract Account.

## Submission rules

- The payment hash, not the grant hash, is the primary Contract Account proof.
- Human amount is `0.01 USDC`; raw amount is `100000` base units.
- Replay Demo is read-only and never signs.
- Never expose secrets, signatures, full XDR, credential IDs, or PII.
- Team identity and payout information stay outside the public repository.