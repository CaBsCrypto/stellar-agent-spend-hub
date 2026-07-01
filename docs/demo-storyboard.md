# SCF Demo Storyboard and Shot List

## Recording format

- Duration: 90 seconds.
- Language: English.
- Canvas: 1920x1080, browser zoom 100 percent.
- Final recording requires both coordinated USDC hashes.
- Prepare explorer tabs before recording; never show environment variables or secret-bearing terminals.

## Shot list

| Time | Screen | Action | Voice-over point |
| --- | --- | --- | --- |
| 0-10s | Dashboard hero | Show product and five-step flow | Agents need bounded payment authority, not custody |
| 10-25s | Provider definition and MPP panel | Show resource and exact `0.01 USDC` quote | Open provider discovery and official Stellar MPP |
| 25-38s | Live Evidence MPP card | Open verified explorer link | Paid resource delivered and publicly verified |
| 38-52s | Contract Account panel | Show passkey owner and session policy | Merchant, asset, amount, budget, and expiry are constrained |
| 52-65s | Live Evidence C-account card | Open second explorer link | Agent session settled without broad wallet access |
| 65-75s | Replay Demo | Switch Live to Replay and show read-only state | Replay never signs or moves funds |
| 75-84s | Evidence API | Show sanitized JSON fields | Evidence is public; secrets, XDR, credentials, and PII are absent |
| 84-90s | Provider Kit and closing line | Show integration definition | Next step is onboarding Stellar-paid MCP/API providers |

## Capture checklist

- Desktop dashboard with all dependencies reachable.
- Mobile dashboard at 390x844 for submission assets.
- MPP transaction `8290da7e...985836` on Stellar Expert.
- Contract Account payment `b37ab921...6af094` on Stellar Expert.
- Sanitized `GET /api/evidence` response.
- Provider Kit definition.
- One blocked policy or replay result.

## Editing notes

- Use direct cuts and readable cursor movement.
- Keep hashes visible long enough to recognize, then open the explorer.
- Add captions for `MPP`, `Passkey`, `Session Policy`, and `Public Receipt`.
- Do not claim mainnet readiness or autonomous production spending.

## Verified capture assets

- [Desktop dashboard](./assets/scf-dashboard-desktop.png)
- [Mobile dashboard](./assets/scf-dashboard-mobile.png)
