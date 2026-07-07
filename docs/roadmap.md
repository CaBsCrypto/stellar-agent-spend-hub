# Roadmap y guia de continuidad

Actualizado: 2026-07-07. Este documento permite retomar el proyecto sin contexto previo. Complementa [current-state.md](./current-state.md) para estado operacional y [architecture.md](./architecture.md) para arquitectura.

## Que es este proyecto

**Stellar Agent Spend Hub**: pagos agenticos supervisados en Stellar testnet. Un agente descubre servicios API/MCP pagados, evalua politica de gasto, prepara una propuesta y un humano aprueba con un solo gesto. El sistema deja receipts sin PII y evidencia on-chain publica y verificable.

- Produccion: <https://agente-pagos-stellar.vercel.app>
- Evidencia publica: `GET /api/evidence` con 2 pagos USDC verificados, owner revoke y 3 fundamentos XLM.
- Paquete SCF Build: solicitud de `US$75,000` completa y congelada en [scf-application.md](./scf-application.md).

## Estado al 2026-07-07

### Completado y verificado

| Bloque | Estado |
| --- | --- |
| Infra de pagos, Sprints 01-24 | MPP oficial, Contract Account con passkey, politicas Soroban, Provider Kit, MCP server, Merchant Lab y evidencia congelada. |
| Fases 0-3 del roadmap original | Demo local, primer pago testnet, smart wallet Soroban y machine payments reales completados. |
| Refactor agent-first, Sprints 25-27 | UI en ingles consistente, navegacion de 5 rutas principales, Trust & Builders colapsado, timeline del agente en Home, aprobacion de un paso, dismiss, receipts `SIMULATED` vs `VERIFIED`, skeletons, chip `DEMO DATA`, `dev:watch`, PWA instalable y bottom nav movil. |
| Calidad | `176/176` tests JS + `31/31` tests Rust en la ultima corrida local. Recorrido validado en [demo-walkthrough-product.md](./demo-walkthrough-product.md). Movil `390x844` sin overflow en la validacion previa. |

### Como retomar en 10 minutos

```powershell
npm install
npm test              # 176 tests JS, sin secretos
npm run dev:watch     # http://localhost:4179, rebuild al guardar
```

- La demo local no requiere variables de entorno.
- Estado local: `data/runtime-state.json`; borrar ese archivo reinicia propuestas y receipts simulados.
- Recorrido de producto: [demo-walkthrough-product.md](./demo-walkthrough-product.md).
- Codigo cliente: `src/client/`, Vanilla ESM con paginas `load/render/bind/destroy`.
- Backend principal: `src/apiRouter.mjs` como dispatcher HTTP, `src/apiRoutes.mjs` como registro de endpoints, `src/apiHttp.mjs` como plumbing HTTP, `src/productReadModels.mjs` como vistas de producto y `src/spendHubService.mjs` como servicio de dominio.
- Tests de UI: `tests/ui-pages.test.mjs`; agregar uno por cada pagina o flujo visual que se toque.

## Reglas de seguridad no negociables

1. Toda compuerta de submit financiero permanece `false` fuera de ventanas supervisadas.
2. El navegador y el agente no reciben claves privadas; el humano aprueba cada pago real.
3. No guardar PII, secretos, firmas ni XDR en receipts, logs o APIs publicas.
4. Lo simulado siempre se etiqueta `SIMULATED`; no presentarlo como settlement real.
5. El lab multichain (`/treasury`, Base, CCTP, Avalanche) queda dormido y fuera de la narrativa principal hasta decision explicita.

## Roadmap recomendado

### Horizonte 1 - Ahora, dias

1. **Production freeze de la UI v2**: corregir docs, correr `npm run qa:full`, ejecutar `vercel build --prod`, desplegar con `vercel deploy --prebuilt --prod --yes` y verificar rutas + PWA.
2. **Push de los 9 commits locales** a GitHub despues del freeze para que remoto y produccion vuelvan a estar alineados.
3. **Grabar clip de producto** con el runbook validado: desktop, movil instalada y Evidence.
4. **Enviar postulacion SCF** cuando el dueno confirme. La condicion tecnica fuerte ya esta cumplida: dos pagos USDC verificados.

### Horizonte 2 - Corto plazo, 1 a 2 semanas

5. **E2E browser automatizado**: un spec del recorrido `Home -> Discover -> Approvals -> Activity -> Evidence`, con emulacion movil.
6. **Ventana supervisada Provider Pilot**: primer proveedor MCP remoto real con aprobacion humana. El runbook base esta en [sprint-20-provider-pilot.md](./sprint-20-provider-pilot.md).
7. **Mejor NLU de busqueda**: sinonimos de recursos API/MCP y stub `AGENT_NLU_ENDPOINT` para un interprete LLM futuro.

### Horizonte 3 - Mediano plazo, 1 a 2 meses

8. **Piloto comercial**: 3-5 proveedores MCP/API reales via Provider Kit y 20-50 usuarios power.
9. **Push notifications PWA**: avisar cuando una propuesta espera aprobacion.
10. **Montos reales acotados en flujo producto**: conectar la experiencia v2 a rails testnet guardados, siempre con gates y confirmacion humana.

### Horizonte 4 - Post-SCF

11. Beta con revision de seguridad y camino responsable a mainnet.
12. Privacy/ZK mas fuerte y bill pay LatAm, Chile primero, solo con partner/API y privacidad madura.
13. Decision multichain: reactivar Base x402/CCTP solo si un partner lo exige.

## Decisiones abiertas del dueno

- Fecha de envio SCF y grabacion final.
- Momento para ejecutar Provider Pilot supervisado.
- Modelo comercial inicial: SaaS bajo, fee por pago o B2B API.
- Autopilot: bloqueado en v1; solo despues de historial, limites estrictos y revoke UX robusta.

## Historial de fases originales

Fase 0, demo local; Fase 1, primer pago testnet; Fase 2, smart wallet Soroban; y Fase 3, machine payments reales: completadas. Fase 4, bill pay LatAm; y Fase 5, piloto comercial: quedan mapeadas a los horizontes 3 y 4.
