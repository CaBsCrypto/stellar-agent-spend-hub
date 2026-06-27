# Arquitectura

## Modelo general

El sistema opera como un Spend Hub: un agente descubre proveedores, crea intents, evalua policy/legal/privacy, pide confirmacion del usuario y liquida por un rail. En v1 el rail funcional de demo es Stellar simulado; el rail real Stellar testnet ya existe como frontera controlada.

```mermaid
flowchart LR
  User["Usuario"] --> Agent["Agent Spend Hub"]
  Agent --> Directory["Provider Directory"]
  Agent --> Legal["Legal Context Adapter"]
  Agent --> Privacy["Privacy Vault + ZK Commitment"]
  Agent --> Policy["Spending Policy"]
  Policy --> Confirm["User Confirm / Passkey v1"]
  Confirm --> Rail["Payment Rail Adapter"]
  Rail --> Stellar["Stellar Testnet / Future Smart Wallet"]
  Rail --> Receipt["Auditable Receipt"]
```

## Flujo interno

1. Discover: buscar proveedor, endpoint, categoria, metodo de pago y contexto legal.
2. Privacy Proof: verificar que no haya PII publica y, si aplica, generar commitment/proof demo.
3. Policy Check: limites, allowlists, asset permitido, riesgo, slippage y confirmacion requerida.
4. User Confirm: en v1 siempre requiere aprobacion humana.
5. Stellar Settle: preparar o ejecutar rail y emitir recibo auditable.

## Componentes actuales

- `SpendHubService`: orquestador de intents, proofs, receipts, directory y approvals.
- `ProviderDirectoryAdapter`: discovery tipo Stripe Directory/MPP.
- `LegalContextAdapter`: evalua LCP, terms hash, trust level y acceptance required.
- `PrivacyVaultAdapter`: simula almacenamiento de secretos como sealed refs.
- `ZkCommitmentAdapter`: commitments/proofs demo sin revelar identificadores.
- `StellarTestnetAdapter`: rail simulado para demo local.
- `StellarTestnetRealAdapter`: rail testnet real con SDK, dry-run por defecto y submit gate.
- `MachinePaymentAdapter`: protocolo demo legacy, deshabilitado en produccion.
- `MppChargeService`: seller oficial Stellar MPP Charge para USDC testnet.
- `StellarRiskService`: prepara un reporte publico de Horizon antes de emitir el challenge.
- `MppReceiptRepository`: cache y receipts sanitizados en Upstash.
- `PolicyEscrowV2`: contrato separado con destination + asset estrictos y presupuesto acumulado.
- `LinkAgentWalletAdapter`: simulacion de Link/SPT como benchmark fiat futuro.
- `CircleX402Adapter` y `TempoAdapter`: benchmarks/future rails, no dependencias v1.

## Entidades clave

- `Provider`: servicio que puede vender recurso digital, accion crypto o bill pay.
- `PaymentIntent`: propuesta de pago con monto, proveedor, rail, privacy requirement y razon del agente.
- `SpendingPolicy`: limites y reglas del usuario.
- `PaymentReceipt`: evidencia auditable sin PII.
- `Proof`: commitment/proof demo asociado a un secreto privado.

## Rails

### Stellar simulado

Usado por el demo local. Permite mostrar UX, receipts, policy y 402 sin depender de fondos reales.

### Stellar testnet real

Usa `@stellar/stellar-sdk`, valida env vars y keypair, prepara pago tiny y solo ejecuta si:

- `STELLAR_SUBMIT_ENABLED=true`
- se llama `npm run testnet:payment -- --execute`
- policy permite el intent
- env vars estan completas
- keypair es valido

### Future rails

- Stellar smart wallet/Soroban con session keys, limits, policy signer y passkeys.
- MPP Charge oficial para recursos digitales; MPP Session queda para una fase posterior.
- Link-like fiat wallets para mercados donde sea viable.
- Tempo/Circle como referencias competitivas, no cambio de rumbo.

## Decision importante

El rail activo de producto sigue siendo Stellar-first. Otros protocolos se usan para aprender patrones de mercado y compatibilidad, no para abandonar la narrativa Stellar.

## Payment execution runtime

The runtime now uses four explicit modes: `simulated`, `stellar-testnet-direct`, `soroban-dry-run`, and `soroban-testnet-submit`. Normal app approval stays in preview mode for Soroban. Only the admin boundary may submit, and only after bearer auth, testnet/native-SAC validation, tiny amount enforcement, idempotency and explicit execution gates.

A receipt is `settled` only when a real transaction hash is available. Dry-runs are `pending` with `executionStatus=preview`; failed submits keep `transactionHash=null`.

## Sprint 09: dos pruebas separadas

```mermaid
flowchart LR
  Buyer["Local buyer agent"] --> Confirm["Human terminal confirmation"]
  Confirm --> MPP["Official MPP Charge"]
  MPP --> Seller["Vercel Stellar Risk API"]
  Seller --> Horizon["Horizon testnet"]
  MPP --> USDC["USDC SAC transfer"]

  Owner["Owner"] --> Escrow["Policy Escrow V2"]
  Session["Session signer"] --> Escrow
  Escrow --> Rules["Destination + asset + per-payment + total budget"]
  Rules --> EscrowUSDC["Tiny USDC SAC transfer"]
```

MPP uses a local classic Stellar buyer key in Sprint 09. Policy Escrow V2 is an independent on-chain control proof. They converge only after Sprint 10 introduces a contract account with `__check_auth` and passkey/auth-entry signing.
