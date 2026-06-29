# Resumen Ejecutivo SCF

## Propuesta

Stellar Agent Spend Hub permite que agentes de IA paguen APIs en USDC sin recibir control ilimitado sobre los fondos del usuario. El usuario administra una cuenta programable mediante passkey y puede entregar al agente una sesion limitada por comercio, activo, monto, presupuesto total y vencimiento.

## Problema

Los agentes necesitan comprar datos, herramientas MCP, sesiones de navegador, inferencia y otros recursos digitales. Hoy las alternativas suelen exigir aprobacion manual para cada uso o entregar credenciales demasiado amplias. Al mismo tiempo, los proveedores necesitan cobrar, entregar el recurso y emitir evidencia sin manejar tarjetas ni datos personales.

## Solucion Stellar

La demo coordina dos pruebas separadas:

1. Un comprador local paga `0.01 USDC` mediante Stellar MPP y desbloquea una API de analisis tecnico de transacciones.
2. Una Contract Account Soroban, administrada por passkey, permite que una session key pague `0.01 USDC` solamente al merchant autorizado y dentro de su presupuesto.

El flujo comun es:

`Discover -> Authorize -> Policy -> Settle -> Verify`

La evidencia publica contiene montos, red, activo, policy y hashes verificables, pero no llaves privadas, firmas, XDR completo, IDs de credenciales ni PII.

## Estado actual

- Aplicacion publica operativa en Vercel.
- Upstash, Horizon y Soroban RPC operativos.
- Tres settlements XLM testnet verificados publicamente.
- Challenge oficial Stellar MPP de `0.01 USDC` probado en produccion.
- Contract Account V1 implementada y Wasm cargado en testnet.
- `94/94` pruebas JavaScript y `31/31` pruebas Rust pasan el QA completo.
- Los dos pagos USDC permanecen pendientes y no muestran hashes simulados.

## Solicitud

Se solicita el equivalente a **US$75.000 en XLM** para cuatro hitos durante 24 semanas:

| Hito | Presupuesto |
| --- | ---: |
| Trust Demo testnet | US$12.000 |
| Provider Kit Pilot | US$18.000 |
| Seguridad y beta | US$25.000 |
| Preparacion mainnet | US$20.000 |

La postulacion no se enviara hasta verificar ambos pagos USDC testnet. Mainnet, autopilot, ZK productivo y pago de cuentas LatAm quedan fuera de alcance hasta completar revision de seguridad y validacion con proveedores.