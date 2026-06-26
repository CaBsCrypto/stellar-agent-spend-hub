# Sprint 06 Result: SAC Transfer Behind Soroban Policy

## Summary

Completed: the Soroban Smart Wallet now moves native XLM testnet through the Stellar Asset Contract only after the smart-wallet policy passes. This is the first end-to-end proof that the agent/session signer can trigger value movement from a pre-funded contract under owner-granted limits.

No mainnet funds, USDC real, PII, seed phrases, secret keys, tokens or customer identifiers were used or stored here.

## Public Evidence

| Field | Value |
| --- | --- |
| Smart wallet contract ID | `CDJEHJ763TTIVHD3MMFWIKO3R2K3A6MJKWZFZDU2L6LXXKEU43CDIGZU` |
| Contract Lab | `https://lab.stellar.org/r/testnet/contract/CDJEHJ763TTIVHD3MMFWIKO3R2K3A6MJKWZFZDU2L6LXXKEU43CDIGZU` |
| Native SAC contract ID | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Wasm hash | `5737b826d56ee4bb21138d501cff2eb99b3275d8b733c7258adcc1a8aa5f5b66` |
| Owner public key | `GDULMCYXQ523T5N763JVI2HGM2UQJQ42SEIH74DKPSFGJ7F37IPXLOBI` |
| Session public key | `GDH7VT4AVZ33E4EI3WVGKABOJNJOGB2J463AAY677IFSCTPB35KYZKLU` |
| Provider allowlist | `api-mcp` |
| Asset allowlist | native XLM SAC |
| Destination allowlist | session public key |
| Per-payment limit | `1` |
| Transfer amount | `1` native SAC unit |
| Network | Stellar testnet / Soroban RPC |

## Transactions

| Step | Transaction |
| --- | --- |
| Upload WASM | `https://stellar.expert/explorer/testnet/tx/1445bbe3c798b36eccff8b808f885b8fd592dee1163772974dd12bf63a2e6861` |
| Deploy contract | `https://stellar.expert/explorer/testnet/tx/c66340964147594710ca288cf09812892c10ce2e83157eb551f2e50e712a4739` |
| Init owner | `https://stellar.expert/explorer/testnet/tx/12e1b95a41650a9e3d4819118807cf475013fc1ec78e6159e10c8c72c67ecfd3` |
| Grant session with asset allowlist | `https://stellar.expert/explorer/testnet/tx/44a2f53a130b47a38ca9fc8a0c07a39e52d24134e08f86bbc378641a755e7d76` |
| Fund contract via native SAC | `https://stellar.expert/explorer/testnet/tx/72c723451e90abd4efb3c8daa2faa7397fa945422db2efc8ce8b1c6e1d3fc003` |
| Execute allowed SAC transfer | `https://stellar.expert/explorer/testnet/tx/8d9810cde8839895cd421756115df3de4b9f8e56f2460076a439b318e0b3ba7f` |

## Verified Behavior

- Native XLM SAC id was resolved with `stellar contract id asset --asset native`.
- New smart wallet ABI exported `execute_allowed_transfer`.
- `grant_session` stored `allowed_assets` with the native SAC id.
- Contract was pre-funded with `1` native SAC unit.
- `execute_allowed_transfer` transferred `1` native SAC unit from the contract to the allowlisted destination.
- Contract emitted `TransferExecutedEvent` with provider `api-mcp`, amount `1`, nonce `2`.
- `read_session` returned active policy with `revoked: false`.

## QA

- `npm run qa:full` passed before testnet execution.
- JS tests: `55/55`.
- Rust contract tests: `11/11`.
- Contract build passed with Wasm hash `5737b826d56ee4bb21138d501cff2eb99b3275d8b733c7258adcc1a8aa5f5b66`.

## Next

Sprint 07 should connect this transfer proof back into the app receipt flow: create a user-confirmed MCP/API payment intent that can call the deployed contract path, still with dry-run and explicit confirmation gates by default.