# Runbook Stellar Testnet

Este runbook existe para llegar al primer pago testnet sin filtrar secretos ni activar submit por accidente.

## Estado actual

- SDK instalado: `@stellar/stellar-sdk`.
- CLI disponible: `npm run testnet:payment`.
- Submit real apagado por defecto.
- Monto tiny por defecto: `0.000001 XLM`.
- QA actual: `npm run qa` con 40 tests.

## Preflight local

```powershell
npm run qa
npm run doctor
npm run testnet:doctor
npm run testnet:payment
```

Resultado esperado antes de configurar env:

- `qa`: pass.
- `doctor`: ok en modo local simulated.
- `testnet:doctor`: `not-ready` por missing env.
- `testnet:payment`: dry-run bloqueado por missing env, sin secretos.

## Variables requeridas

Configurar en la shell, no en archivos versionados:

```powershell
$env:STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
$env:STELLAR_PUBLIC_KEY="G..."
$env:STELLAR_SECRET_KEY="S..."
$env:STELLAR_TEST_DESTINATION="G..."
$env:STELLAR_TEST_AMOUNT_XLM="0.000001"
```

No activar submit aun.

## Fondear cuenta testnet

Usar Friendbot o una cuenta testnet existente para fondear la cuenta origen. No pegar secret keys en chats, docs o logs.

Verificar que:

- cuenta origen existe en Horizon testnet.
- cuenta destino existe o acepta pago nativo XLM.
- public key corresponde al secret key.

## Dry-run con env configurado

```powershell
npm run setup:testnet
npm run testnet:payment
```

Esperado:

- `setup:testnet` status `ready`.
- `testnet:payment` modo `dry-run`.
- `canSubmit` false si `STELLAR_SUBMIT_ENABLED` no esta true.
- monto `0.000001`.
- no aparece `STELLAR_SECRET_KEY`.

## Ejecucion tiny supervisada

Solo despues del dry-run:

```powershell
$env:STELLAR_SUBMIT_ENABLED="true"
npm run testnet:payment -- --execute
$env:STELLAR_SUBMIT_ENABLED="false"
```

Esperado:

- receipt `settled`.
- `finality: submitted-testnet`.
- `transactionHash` presente.
- no secretos en output.

## Post-check

1. Buscar hash en Horizon testnet.
2. Confirmar monto tiny.
3. Confirmar destination correcta.
4. Confirmar memo sin PII.
5. Guardar solo hash/receipt, no claves.
6. Volver a `STELLAR_SUBMIT_ENABLED=false`.

## Criterio de exito

El proyecto cruza de demo local a testnet real cuando tenemos:

- `setup:testnet` ready.
- primer hash testnet validado.
- receipt sin PII.
- QA verde despues del pago.
- decision documentada sobre siguiente paso: smart wallet Soroban o mas machine-payment providers.
