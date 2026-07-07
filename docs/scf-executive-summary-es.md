# Resumen Ejecutivo SCF

## Propuesta

Stellar Agent Spend Hub permite que agentes de IA paguen APIs en USDC sin recibir control ilimitado sobre los fondos del usuario. Una passkey administra la Contract Account y concede una sesion limitada por comercio, activo, monto, presupuesto y vencimiento.

## Prueba verificada

La demo coordina dos pagos reales en Stellar testnet:

1. Stellar MPP pago `0.01 USDC` y desbloqueo una API: `8290da7e...985836`.
2. Una session key autorizada por passkey pago `0.01 USDC` bajo policy Soroban: `b37ab921...6af094`.

El segundo submit identico fue rechazado con `409` y no movio fondos. La evidencia publica contiene montos, red, activo, policy y hashes, sin llaves privadas, firmas, XDR completo, IDs de credenciales ni PII.

## Estado

- Aplicacion y Evidence API publicas en Vercel.
- Contract Account humana desplegada, fondeada y limitada a un merchant y USDC testnet.
- Upstash, Horizon y Soroban RPC operativos.
- `176/176` pruebas JavaScript y `31/31` pruebas Rust.
- Mainnet, autopilot y pagos LatAm permanecen fuera de alcance.

## Solicitud

Se solicita el equivalente a **US$75.000 en XLM** durante 24 semanas:

| Hito | Presupuesto |
| --- | ---: |
| Trust Demo testnet | US$12.000 |
| Provider Kit Pilot | US$18.000 |
| Seguridad y beta | US$25.000 |
| Preparacion mainnet | US$20.000 |

El siguiente uso de fondos es convertir la prueba en un Provider Kit integrado por un design partner, realizar revision de seguridad y operar una beta supervisada antes de cualquier decision de mainnet.