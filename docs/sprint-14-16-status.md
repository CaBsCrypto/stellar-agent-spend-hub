# Sprint 14-16 Status

## Completed without human gates

- Hardened the SCF Build application around a `$75,000` request and four milestones.
- Added the Spanish executive summary, pitch-deck narrative, 90-second script, and storyboard.
- Versioned the public Evidence API as `scf-evidence-v2`.
- Added explicit `verificationStatus`, `evidenceType`, `verifiedAt`, policy, and explorer fields.
- Added hard invariants: pending evidence cannot contain a hash, explorer URL, or verification timestamp.
- Connected the dashboard to verified XLM foundations and the two coordinated USDC states.
- Reduced the visible trust flow to `Discover -> Authorize -> Policy -> Settle -> Verify`.
- Archived the earlier escrow experiment outside the primary README and demo narrative.
- Kept production submit gates closed.

## Public endpoints

- `GET /api/evidence`
- `GET /api/diagnostics/public`
- `GET /api/provider-kit/definition`
- `POST /api/provider-kit/validate`
- `GET /api/mpp/stellar-risk?tx=<64-hex>`
- `GET /api/contract-account/status`

## Submission blockers

1. Fund `spendhub-owner` with at least `0.03 USDC` testnet through Circle Faucet.
2. Execute and verify the MPP `0.01 USDC` settlement and rejected replay.
3. Register a passkey on the stable production domain.
4. Deploy and fund Spend Account V1.
5. Grant the 24-hour session and execute its `0.01 USDC` payment.
6. Publish both hashes through stored receipts and confirm all gates return to `false`.
7. Capture the final video and submit only after the full acceptance checklist passes.

No hash will be fabricated if Faucet, WebAuthn, or external infrastructure is unavailable.