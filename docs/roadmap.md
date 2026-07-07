# Roadmap y guía de continuidad

Actualizado: 2026-07-07. Este documento permite que cualquier persona retome el proyecto sin contexto previo. Complementa [current-state.md](./current-state.md) (estado operacional) y [architecture.md](./architecture.md).

## Qué es este proyecto

**Stellar Agent Spend Hub**: pagos agénticos supervisados en Stellar testnet. Un agente descubre servicios API/MCP pagados, chequea política (merchant, monto, presupuesto, expiración, privacidad), prepara la propuesta y **un humano aprueba con un solo gesto**. Recibos sin PII; evidencia on-chain pública y verificable.

- Producción: <https://agente-pagos-stellar.vercel.app>
- Evidencia pública: `GET /api/evidence` (2 pagos USDC verificados + revoke + 3 fundaciones XLM)
- Paquete SCF Build ($75k USD) completo y congelado en [scf-application.md](./scf-application.md)

## Estado al 2026-07-07

### Completado y verificado

| Bloque | Estado |
| --- | --- |
| Infra de pagos (Sprints 01-24) | MPP oficial, Contract Account con passkey, políticas Soroban, Provider Kit, MCP server, Merchant Lab. Evidencia congelada. |
| Fases 0-3 del roadmap original | Demo local, primer pago testnet, smart wallet Soroban, machine payments reales. |
| Refactor agent-first (Sprints 25.5-27) | UI en inglés consistente; navegación 5 rutas + grupo Trust & Builders colapsado; timeline del agente en Home; aprobación de un paso + dismiss; recibos `SIMULATED` vs `VERIFIED`; skeletons; chip DEMO DATA; `dev:watch`; **PWA instalable + bottom nav móvil**. |
| Calidad | 176 tests JS (15 suites, incluye `test:ui`) + 31 Rust. Recorrido validado en [demo-walkthrough-product.md](./demo-walkthrough-product.md). Móvil 390x844 sin overflow en todas las rutas. |

### Cómo retomar (onboarding en 10 minutos)

```powershell
npm install
npm test              # 176 tests, no requiere red ni secretos
npm run dev:watch     # http://localhost:4179, rebuild al guardar
```

- Cero variables de entorno para la demo. Estado local en `data/runtime-state.json` (borrar = reset).
- Recorrido de producto paso a paso: [demo-walkthrough-product.md](./demo-walkthrough-product.md).
- Código cliente: `src/client/` (~1.800 lineas, vanilla ESM; páginas con patrón `load/render/bind/destroy`, render puro a string = testeable). Backend: `src/apiRouter.mjs` + `src/spendHubService.mjs`.
- Tests de UI: `tests/ui-pages.test.mjs` — agregar uno por cada página que se toque.

### Reglas de seguridad no negociables

1. Toda compuerta de submit financiero permanece `false` fuera de ventanas supervisadas.
2. El navegador y el agente jamás reciben claves privadas; el humano aprueba cada pago real.
3. Nada de PII, secretos, firmas ni XDR en recibos, logs o APIs públicas (`sensitiveDataGuard`).
4. Lo simulado siempre se etiqueta `SIMULATED`; nunca presentarlo como settlement real.
5. El lab multichain (`/treasury`, Base, CCTP, Avalanche) queda dormido: no promoverlo sin decisión explícita del dueño.

## Roadmap

### Horizonte 1 — Ahora (días)

1. **Deploy a producción de la UI v2** — `npm run qa:full` → `vercel build --prod` → `vercel deploy --prebuilt --prod --yes`. Verificar el prompt de instalación PWA en un teléfono real. *(Requiere al dueño; supervisado.)*
2. **Grabar el clip de producto** con el runbook validado (desktop + móvil instalada).
3. **Enviar la postulación SCF** — la condición de bloqueo (dos pagos verificados) se cumplió; solo falta QA de medios y la decisión. Es el ítem de mayor retorno del proyecto.

### Horizonte 2 — Corto plazo (1-2 semanas)

4. **E2E Playwright** (pendiente Sprint 26): un spec del recorrido completo, `npm run test:e2e`, con emulación móvil. ~2 h + ~100 MB.
5. **Ventana supervisada del Provider Pilot (Sprint 20)**: primer proveedor MCP remoto real con aprobación humana. Ya implementado; solo ejecutar el runbook [sprint-20-provider-pilot.md](./sprint-20-provider-pilot.md).
6. **Sinónimos/NLU del buscador** (stretch Sprint 26): más frases naturales → proveedor correcto; stub `AGENT_NLU_ENDPOINT` para un intérprete LLM futuro.

### Horizonte 3 — Mediano plazo (1-2 meses) = Fase 5 original

7. **Piloto comercial**: 3-5 proveedores MCP/API reales integrados vía Provider Kit ([partner-shortlist.md](./partner-shortlist.md)) y 20-50 usuarios power. Métricas: intents/usuario, pagos completados, bloqueos correctos, recurrencia.
8. **Push notifications PWA**: "proposal waiting for approval" — el caso de uso móvil completo.
9. **Montos reales acotados** en el flujo de producto (hoy la demo liquida en rail simulado; conectar el flujo v2 al rail testnet guardado existente).

### Horizonte 4 — Largo plazo (post-SCF)

10. Beta con revisión de seguridad y camino responsable a mainnet (milestones de la postulación SCF).
11. Privacy/ZK más fuerte y **bill pay LatAm** (Chile primero) — Fase 4 original, sigue condicionada a partners y privacidad madura.
12. Decisión sobre el lab multichain: retomar Base x402/CCTP solo si un partner lo exige.

## Decisiones abiertas (del dueño, no del código)

- Fecha de envío SCF y re-grabación del video con la UI nueva.
- Cuándo agendar la ventana supervisada del Provider Pilot.
- Modelo de monetización (SaaS bajo / fee por pago / B2B API) — sin cambios desde el roadmap original.
- Autopilot: solo tras historial, límites estrictos y UX de revoke (invariante v1: bloqueado).

## Historial de fases originales (referencia)

Fase 0 (demo local), Fase 1 (primer pago testnet), Fase 2 (smart wallet Soroban) y Fase 3 (machine payments reales): **completadas** — detalle en el historial git de este archivo y en los docs de sprint. Fase 4 (bill pay LatAm) y Fase 5 (piloto comercial) quedan mapeadas a los horizontes 3-4 de arriba.
