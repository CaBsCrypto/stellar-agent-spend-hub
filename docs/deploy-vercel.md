# Deploy Vercel

## Objetivo

Publicar el demo del Stellar Agent Spend Hub con UI estatica y API serverless en Vercel, usando variables privadas para llaves Stellar testnet.

## Estado

- Proyecto Vercel linkeado: `agente-pagos-stellar`.
- API serverless: `api/[...path].mjs` reutiliza el backend local.
- Runtime state en Vercel usa `/tmp`, suficiente para demo efimera.
- Secrets testnet se guardan en Vercel como variables privadas/sensitive en `production` y `preview`.

## Variables requeridas

- `STELLAR_HORIZON_URL`
- `STELLAR_PUBLIC_KEY`
- `STELLAR_SECRET_KEY` sensitive
- `STELLAR_TEST_DESTINATION`
- `STELLAR_TEST_AMOUNT_XLM`
- `STELLAR_SUBMIT_ENABLED`
- `SPENDHUB_*_PUBLIC_KEY`
- `SPENDHUB_*_SECRET_KEY` sensitive
- `TESTNET_PAYMENT_ADMIN_TOKEN` sensitive

## Comandos

```powershell
npm run qa
vercel build
vercel deploy --prebuilt
```

Para produccion:

```powershell
vercel build --prod
vercel deploy --prebuilt --prod
```

## Reglas

- No usar `NEXT_PUBLIC_` para secrets.
- No guardar secret keys en docs, README, runtime-state ni logs.
- Mantener `STELLAR_SUBMIT_ENABLED=false` salvo prueba tiny supervisada.
- El deploy es demo; persistencia real requiere storage externo.

