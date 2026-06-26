# Vercel Testnet Environment

## Objetivo

Generar llaves Stellar testnet para demo, fondearlas y guardarlas como variables privadas de Vercel sin imprimir secret keys ni commitearlas.

## Modelo de identidades

- `spendhub-deployer`: despliegue de contratos Soroban y source testnet temporal.
- `spendhub-user-demo`: usuario demo, futuro owner de smart wallet.
- `spendhub-agent-session`: session key demo para permisos limitados.
- `spendhub-merchant-demo`: destino para pagos tiny y proveedor demo.

## Variables en Vercel

Role-specific:

- `SPENDHUB_DEPLOYER_PUBLIC_KEY`
- `SPENDHUB_DEPLOYER_SECRET_KEY` sensitive
- `SPENDHUB_USER_DEMO_PUBLIC_KEY`
- `SPENDHUB_USER_DEMO_SECRET_KEY` sensitive
- `SPENDHUB_AGENT_SESSION_PUBLIC_KEY`
- `SPENDHUB_AGENT_SESSION_SECRET_KEY` sensitive
- `SPENDHUB_MERCHANT_DEMO_PUBLIC_KEY`
- `SPENDHUB_MERCHANT_DEMO_SECRET_KEY` sensitive

Compatibilidad con scripts actuales:

- `STELLAR_HORIZON_URL`
- `STELLAR_PUBLIC_KEY`
- `STELLAR_SECRET_KEY` sensitive
- `STELLAR_TEST_DESTINATION`
- `STELLAR_TEST_AMOUNT_XLM=0.000001`
- `STELLAR_SUBMIT_ENABLED=false`

## Comando seguro

```powershell
node scripts/vercel-testnet-keys.mjs
```

El comando:

- genera keypairs en memoria.
- fondea public keys con Friendbot.
- envia secrets a Vercel por stdin.
- marca secret keys como sensitive.
- imprime solo public keys.

## Reglas

- No copiar secret keys a README, docs, chat o runtime-state.
- `STELLAR_SUBMIT_ENABLED` queda `false` por defecto.
- Para una prueba real se activa temporalmente y se vuelve a apagar.
- Production y Preview usan llaves testnet privadas/sensitive; Development queda fuera porque Vercel CLI no permite sensitive env vars para development. Nunca usar estas llaves en mainnet.

