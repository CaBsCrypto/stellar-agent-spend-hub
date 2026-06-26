# Pitch

## One-liner

Stellar Agent Spend Hub es una capa privacy-first para que agentes de IA descubran, preparen y paguen recursos digitales o cuentas, con fondos controlados por el usuario, reglas programables y receipts auditables.

## Problema

Los agentes van a necesitar comprar cosas: APIs, MCPs, cloud, datos, software, reservas y eventualmente cuentas del mundo real. Pero darles dinero sin controles abre tres riesgos:

- gasto no autorizado.
- filtracion de datos personales.
- falta de evidencia sobre por que y bajo que reglas se pago.

## Solucion

Un Spend Hub donde el agente propone pagos, el usuario define policy y cada intento pasa por:

Discover -> Privacy Proof -> Policy Check -> User Confirm -> Stellar Settle.

En v1 el usuario confirma todo. El agente nunca recibe private keys ni credenciales bancarias.

## Por que Stellar

- Stablecoins y pagos globales son parte natural del ecosistema.
- Testnet y SDK permiten demostrar pago real de forma rapida.
- Soroban permite evolucionar a smart wallets, session keys, limits y policy signer.
- Buen encaje para grants, developer ecosystem y narrativa de agentic payments.
- LatAm necesita pagos utiles, baratos y programables.

## Por que ahora

Stripe/Tempo, Circle x402, Link agent wallet y Mastercard Agent Pay validan que machine payments y agentic commerce se estan moviendo rapido. La oportunidad es construir una version Stellar-first con privacidad, policy receipts y foco LatAm antes de que la categoria se cierre.

## Diferenciacion

- No solo rail: producto de control y confianza.
- No solo wallet: agente entrenable con preferencias, budgets y historial.
- No solo cripto: camino a cuentas LatAm y servicios cotidianos.
- No solo compliance textual: receipts con policy, legal context, proof hash y transaction hash.
- No expone PII en memos, receipts o logs.

## Demo financiable

1. El agente descubre un MCP/API provider.
2. Crea un PaymentIntent.
3. Evalua legal context, privacy y spending policy.
4. Usuario confirma.
5. Se ejecuta o prepara pago Stellar testnet tiny segun el gate activo.
6. Se emite receipt auditable sin PII.
7. El agente reintenta recurso HTTP 402 con credential y recibe el servicio.

## Ask potencial para Stellar

Buscamos apoyo para convertir el MVP con hash testnet verificado en una demo Soroban smart wallet con session keys, limits, allowlists, agentic payment flows y privacy-first receipts para pagos digitales y, luego, bill pay LatAm.

## Narrativa corta

Circle y Stripe validan que los agentes pagaran. Nosotros queremos que paguen con control, privacidad y rails Stellar.
