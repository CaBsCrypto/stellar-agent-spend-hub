# Sprint 28: Feedback Review Loop

Goal: turn the public pilot feedback form into a safe learning surface before adding more payment features.

## What changed

- `/api/feedback` now returns privacy-safe aggregates: count, latest timestamp, clarity, trust, roles and repeated themes.
- Raw feedback text stays internal to the store and is never exposed by the public API.
- `Activity` shows a `Pilot learning` panel so testers, builders and evaluators can see whether the first sessions are producing signal.
- The learning view does not enable any financial submit gate.

## How to use it

1. Send the production link to 5-10 testers using `docs/first-outreach-pack.md`.
2. Ask them to complete the two-minute flow and submit the Home feedback form.
3. Open `Activity` to review aggregate signal.
4. Use repeated themes to decide the next UI fix or provider conversation.

## Decision rule

- Under 10 responses: treat feedback as directional only.
- 10+ responses: prioritize repeated themes over one-off comments.
- Any trust or clarity confusion beats new feature work.

## Safety

- Do not ask testers for emails, phone numbers, RUT, customer IDs, account numbers, private keys or secrets.
- Do not expose raw feedback in public endpoints.
- Keep Stellar submit gates closed during feedback sessions.
- Keep multichain out of the public narrative for this round.
