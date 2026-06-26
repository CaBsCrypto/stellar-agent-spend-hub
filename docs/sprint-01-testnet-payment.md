# Sprint 01: Primer Pago Stellar Testnet

## Objetivo

Cruzar de MVP local simulado a primer pago real en Stellar testnet, manteniendo la narrativa privacy-first: pago tiny, supervisado, sin secretos en output, con receipt auditable y hash verificable en Horizon.

## Score inicial

- MVP local/demo financiable: 78/100.
- Seguridad/privacy v1: 72/100.
- Machine payments HTTP 402: 75/100.
- Documentacion estrategica: 70/100.
- Camino Stellar testnet: 60/100.
- Pago real testnet ejecutado: 35/100.

## Meta del sprint

Al terminar este sprint deberiamos estar en:

- MVP local/demo financiable: 85/100.
- Camino Stellar testnet: 80/100.
- Pago real testnet ejecutado: 60/100.

## Entregables

1. Cuenta Stellar testnet origen creada y fondeada.
2. Cuenta destino testnet definida.
3. Env vars configuradas solo en shell local.
4. `npm run setup:testnet` en estado `ready`.
5. `npm run testnet:payment` en dry-run correcto.
6. Primer `npm run testnet:payment -- --execute` con `transactionHash` real.
7. Hash validado en Horizon testnet.
8. Receipt/output revisado: sin `STELLAR_SECRET_KEY`, sin PII, memo corto y seguro.
9. `npm run qa` verde despues del pago.
10. Documento de resultado del sprint actualizado con hash y lecciones, sin secretos.

## Backlog priorizado

### P0: Preparar cuenta y entorno testnet

- Crear o escoger cuenta origen testnet.
- Fondear cuenta origen con Friendbot.
- Definir destino testnet separado de origen si es posible.
- Exportar en shell:
  - `STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org`
  - `STELLAR_PUBLIC_KEY`
  - `STELLAR_SECRET_KEY`
  - `STELLAR_TEST_DESTINATION`
  - `STELLAR_TEST_AMOUNT_XLM=0.000001`
- No escribir secretos en `.env`, README, docs, runtime-state o chat.

### P0: Validar readiness sin enviar fondos

- Ejecutar `npm run setup:testnet`.
- Confirmar status `ready`.
- Ejecutar `npm run testnet:payment`.
- Confirmar modo `dry-run`, monto `0.000001`, destino correcto y `STELLAR_SUBMIT_ENABLED=false`.
- Confirmar que output no contiene secret key.

### P0: Ejecutar primer pago tiny

- Activar temporalmente `$env:STELLAR_SUBMIT_ENABLED="true"`.
- Ejecutar `npm run testnet:payment -- --execute`.
- Guardar solo `transactionHash`, receipt id y timestamp.
- Desactivar `$env:STELLAR_SUBMIT_ENABLED="false"`.
- Validar hash en Horizon testnet.

### P1: Cerrar evidencia del sprint

- Ejecutar `npm run qa`.
- Crear/actualizar un resultado de sprint sin secretos con:
  - fecha.
  - hash.
  - monto.
  - rail.
  - estado de QA.
  - problemas encontrados.
- Actualizar score post-sprint.

### P1: Preparar demo narrativo

- Definir guion de demo de 3 minutos:
  - agente descubre provider.
  - crea intent.
  - policy permite.
  - usuario confirma.
  - Stellar testnet liquida tiny payment.
  - receipt auditable.
- Conectar el hash testnet a la narrativa de Stellar Trust Agent.

### P2: Siguiente arquitectura

- Decidir siguiente bloque tecnico:
  - smart wallet Soroban con limits/session key.
  - proveedor MCP/API real con 402.
  - UI de testnet receipt/hash.
- Recomendacion por defecto: smart wallet Soroban minimal despues del primer hash.

## Criterios de aceptacion

- `npm run qa` pasa con 40 tests o mas.
- `npm run setup:testnet` devuelve `ready` con env vars configuradas.
- `npm run testnet:payment` dry-run no envia fondos.
- Submit real solo ocurre con `STELLAR_SUBMIT_ENABLED=true` y `--execute`.
- Existe `transactionHash` real en Stellar testnet.
- Output y receipt no incluyen private key, RUT, email, telefono, numero de cuenta, card data ni client secrets.
- El monto enviado es tiny (`0.000001 XLM` salvo decision explicita distinta).
- El hash se puede verificar en Horizon testnet.

## Riesgos y mitigaciones

- Secret key filtrada: usar solo variables de shell y revisar output antes de compartir.
- Enviar monto incorrecto: mantener `STELLAR_TEST_AMOUNT_XLM=0.000001`.
- Destination incorrecta: revisar `STELLAR_TEST_DESTINATION` en dry-run antes de `--execute`.
- Submit accidental: doble gate obligatorio `STELLAR_SUBMIT_ENABLED=true` + `--execute`.
- Entorno PowerShell inestable para servidor background: no depende del sprint; usar CLI autocontenidos.

## Comandos del sprint

```powershell
npm run qa
npm run setup:testnet
npm run testnet:doctor
npm run testnet:payment
$env:STELLAR_SUBMIT_ENABLED="true"
npm run testnet:payment -- --execute
$env:STELLAR_SUBMIT_ENABLED="false"
npm run qa
```

## Definicion de terminado

El sprint termina cuando tenemos un hash testnet validado, QA verde despues del pago y un resumen sin secretos listo para usar en pitch/demo.
