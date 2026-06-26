# Roadmap

## Fase 0: Demo local funcional

Estado: completado.

Incluye:

- dashboard local.
- provider directory.
- intents y receipts.
- policy engine.
- privacy guard.
- proof demo.
- HTTP 402 machine payment loop.
- Link/Circle/Tempo como benchmark.

## Fase 1: Primer pago Stellar testnet

Estado: completado.

Resultado:

- pago tiny ejecutado desde Vercel hacia Stellar testnet.
- hash publico validado en Horizon: `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- monto: `0.0000010 XLM`.
- `STELLAR_SUBMIT_ENABLED` restaurado a `false` despues de la prueba.
- receipt y documentacion guardan solo datos publicos.

## Fase 2: Smart wallet / Soroban

Estado: siguiente sprint.

Objetivo:

Mover el modelo desde una keypair testnet simple hacia smart wallet controlada por usuario.

Componentes:

- owner/user.
- session keys limitadas.
- spending limits on-chain/off-chain.
- allowlists de destinos/proveedores.
- policy signer separado.
- expiration y revoke permissions.
- scheduled payments opcionales despues del MVP.

Decision para Sprint 03:

Partir con una smart wallet Soroban minima para demostrar permisos de agente: owner, session signer, per-payment limit, allowlist, expiry y revoke. Mantener policy escrow o account abstraction avanzada como evolucion, no como requisito del primer contrato.

## Fase 3: Machine payments reales

Objetivo:

Conectar el loop 402 a recursos digitales reales.

Candidatos:

- MCP server privado.
- API de busqueda o browsing.
- credits internos del producto.
- endpoint de datos pagado por request.

Criterios:

- precio bajo.
- delivery instantaneo.
- sin PII.
- receipt verificable.
- buen demo para hackathon/grant.

## Fase 4: Privacy bill pay LatAm

Objetivo:

Preparar pagos de cuentas reales sin exponer RUT, telefono o numero de cliente.

Precondiciones:

- privacy vault real o proveedor seguro.
- commitments/proofs mas robustos.
- partner/agregador de recargas o bill pay.
- terminos claros y LCP/legal snapshot.
- UX de consentimiento fuerte.

Primer pais candidato: Chile.

## Fase 5: Piloto comercial

Objetivo:

20-50 usuarios power users crypto/LatAm o 3-5 partners MCP/API.

Metricas:

- intents creados por usuario.
- pagos completados.
- pagos bloqueados correctamente.
- confianza percibida.
- ahorro de tiempo percibido.
- recurrencia semanal.
- willingness to pay.

## Decisiones abiertas

- Stablecoin principal: XLM para testnet tiny, USDC para narrativa comercial.
- Primer proveedor real: MCP/API propio vs partner externo.
- Modelo de monetizacion: SaaS bajo, fee por pago exitoso o B2B API.
- Autopilot: solo despues de historial, limites estrictos y revoke UX.