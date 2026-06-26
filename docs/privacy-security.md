# Privacidad y Seguridad

## Regla principal

El agente nunca debe recibir private keys, credenciales bancarias, PAN de tarjetas, passwords, API secrets, RUT, telefono, email, direccion, numero de cliente o numero de cuenta en texto claro.

## Datos prohibidos en superficies publicas

No deben aparecer en:

- logs
- receipts
- memos Stellar
- metadata publica
- LCP/legal context
- runtime state
- dashboard publico
- challenge HTTP 402
- payment credentials

Categorias bloqueadas por `sensitiveDataGuard`:

- RUT
- email
- telefono
- card data
- account/client/customer numbers
- client secrets y API keys tipo `sk_`, `pk_`, `whsec_`, etc.

## Modelo v1

La privacidad v1 es demostrativa, no production-grade ZK.

Incluye:

- `PrivacyVaultAdapter`: guarda una referencia sellada demo, no el dato claro en superficies publicas.
- `ZkCommitmentAdapter`: genera commitments tipo hash de provider, secret ref y salt.
- Proof demo para desbloquear intents `zk-required`.
- Receipts con `proofHash`, `commitment` y `privacyLevel`, sin PII.

No incluye aun:

- circuitos ZK auditados.
- vault real con HSM/KMS.
- claves del usuario en hardware/passkeys reales.
- attestation formal de proveedor.
- cumplimiento regulatorio completo.

## Training Mode

En v1 todo pago real requiere confirmacion humana. Autopilot queda bloqueado aunque el agente recomiende pagar.

Motivos:

- Reducir riesgo de perdida de fondos.
- Entrenar preferencias del usuario.
- Generar historial de confianza.
- Evitar responsabilidades legales prematuras.

## Policy gates

Un pago se bloquea si:

- el proveedor no esta allowlisted.
- el monto supera limite por pago, diario o mensual.
- falta legal context cuando la policy lo exige.
- `atrHash` no coincide.
- el nivel de trust legal es insuficiente.
- falta proof para bill pay/private data.
- el asset crypto no esta permitido.
- el riesgo DeFi es superior a low en v1.
- se solicita autopilot.
- se detecta PII o secretos.

## Seguridad para testnet

El primer pago testnet debe ser tiny y supervisado.

Gates obligatorios:

- secrets solo en env vars de shell.
- `STELLAR_SUBMIT_ENABLED=true` solo durante la prueba.
- `--execute` obligatorio para enviar.
- `STELLAR_TEST_AMOUNT_XLM=0.000001` recomendado.
- revisar `npm run setup:testnet` antes.
- revisar recibo/hash despues.

## Futuro production-grade

- Smart wallet Soroban con session keys limitadas.
- Policy signer separado del agente LLM.
- Passkeys/WebAuthn para confirmacion.
- Allowance por categoria/proveedor.
- Commitments verificables por proveedor.
- ZK circuits para membership/ownership sin revelar identificador.
- Key management con KMS/HSM o wallet del usuario.
- Auditoria append-only de policy decisions.
