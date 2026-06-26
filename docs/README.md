# Docs de Alto Nivel

Esta carpeta contiene la memoria estrategica y tecnica del proyecto. El README raiz funciona como landing publico para GitHub; estos documentos sirven para tomar decisiones, preparar pitch, conversar con Stellar y mantener el foco mientras avanzamos hacia Soroban smart wallets y partners MCP/API.

## Orden recomendado

1. [Current state](./current-state.md): estado real, scores, hash testnet y riesgos actuales.
2. [Producto](./product.md): que estamos construyendo, para quien y por que ahora.
3. [Arquitectura](./architecture.md): componentes, flujo interno y rails.
4. [Privacidad y seguridad](./privacy-security.md): reglas duras, datos prohibidos y modelo ZK.
5. [Partner strategy](./partner-strategy.md): rutas para MCP/API providers, Stellar ecosystem y servicios digitales.
6. [Runbook testnet](./testnet-runbook.md): camino controlado para pagos Stellar testnet.
7. [Sprint 02 result](./sprint-02-testnet-payment-result.md): evidencia publica del primer pago testnet.
8. [Sprint 03 smart wallet plan](./sprint-03-smart-wallet-plan.md): plan Soroban para limits, allowlists y session keys.
9. [Roadmap](./roadmap.md): fases, decisiones pendientes y criterios de avance.
10. [Deploy Vercel](./deploy-vercel.md): deploy, env vars privadas y limites del runtime serverless.
11. [Pitch](./pitch.md): narrativa para grants, partners y primeros usuarios.

## Principios del proyecto

- Stellar-first, pero con adaptadores para no quedar encerrados.
- Usuario custodio; el agente no toca private keys ni credenciales bancarias.
- Training Mode v1: todo pago real requiere confirmacion humana.
- Privacy-first: no RUT, telefono, email, numero de cuenta, tarjeta, API keys ni client secrets en logs, receipts, memos o metadata publica.
- Cuentas LatAm son roadmap importante, pero solo despues de tener capa privacy/ZK mas madura.
- Wedge inicial: pagos MCP/API/servicios digitales y acciones crypto simples bajo policy.

## Estado actual

- MVP local funcional con dashboard, provider directory, intents, receipts, proof demo y flujo HTTP 402.
- Stellar testnet real rail probado con un pago tiny desde Vercel.
- Primer hash testnet: `4ebf30f6a9492f09739cbb5dd2710766f5a520097f2100e14e2918dd633d97bb`.
- `@stellar/stellar-sdk` instalado.
- `STELLAR_SUBMIT_ENABLED=false` es el estado normal en produccion.
- Sprint 03 iniciado: Soroban smart wallet adapter scaffold con owner, session key, limits, allowlist, expiry y revocation tests.