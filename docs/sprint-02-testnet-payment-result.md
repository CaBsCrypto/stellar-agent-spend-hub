# Sprint 02 Testnet Payment Result

## Estado

Completado: primer pago tiny real en Stellar testnet ejecutado desde Vercel con endpoint admin server-side, bearer token privado y `STELLAR_SUBMIT_ENABLED` activado solo durante la ventana de prueba.

## Evidencia publica permitida

- Fecha Horizon: `2026-06-26T02:17:02Z`.
- Fecha receipt Vercel: `2026-06-26T02:17:03.433Z`.
- Transaction hash: `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- Horizon URL: `https://horizon-testnet.stellar.org/transactions/4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- Ledger: `3285224`.
- Operation: `payment`.
- Amount: `0.0000010 XLM`.
- Rail: `Stellar Testnet Real Rail`.
- Network: `stellar:testnet`.
- Asset: `native XLM`.
- Finality: `submitted-testnet`.
- Source public key: `GDHVLS4D76CFR4OLJWFHYYKWC526QLTGADBNLUII5QG6XS2QM4VY4WC5`.
- Destination public key: `GAJHUKKQVK3OKUAAJ3GTE2U7BWSM4L7JY7CLMRFHJ4S2Z7HEN5L7NHPX`.
- Memo: `spend:mintestnetmquavucg`.
- Receipt id: `receipt-c1ae709332c6`.

## QA status post-payment

- `npm test`: passed, `46/46`.
- `vercel build --prod`: passed.
- `vercel deploy --prebuilt --prod --yes`: passed.
- `npm run vercel:testnet-payment` with submit enabled: returned settled receipt with transaction hash.
- Horizon testnet transaction lookup: `successful: true`.
- Horizon testnet operation lookup: `payment`, amount `0.0000010`, destination public key confirmed.
- `STELLAR_SUBMIT_ENABLED`: restored to `false` and redeployed after the payment.
- `npm run vercel:testnet-payment` after restore: blocked with safe `409`.

## Lessons

- Vercel catch-all output only routed one-segment `/api/*` paths, so Sprint 02 added an explicit `api/admin/testnet-payment.mjs` function for the nested admin endpoint.
- Vercel CLI can store piped env values with a trailing newline; the submit gate now normalizes with `trim().toLowerCase()` before comparing to `true`.
- The CLI trigger now refuses to treat non-JSON HTML as success and prints only a generic non-JSON endpoint error.
- The admin endpoint should remain a temporary demo-only control surface until Soroban smart wallet limits/session keys replace this flow.

## Reglas

- No guardar `STELLAR_SECRET_KEY`.
- No guardar `TESTNET_PAYMENT_ADMIN_TOKEN`.
- No pegar outputs completos si contienen datos no revisados.
- Guardar solo hash, public keys, amount, rail, network, finality y lessons.

## Comandos seguros

```powershell
npm run qa
vercel build --prod
vercel deploy --prebuilt --prod --yes
npm run vercel:testnet-payment
```

Para otro submit real, activar temporalmente `STELLAR_SUBMIT_ENABLED=true` en Vercel, redeployar, ejecutar `npm run vercel:testnet-payment`, volver a `false` y redeployar.