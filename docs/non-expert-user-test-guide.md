# Non-Expert User Test Guide

Use this for five short feedback sessions with curious users who are not crypto or Stellar experts.

## Goal

Learn whether a user understands the value promise in under 20 seconds: the agent finds a digital service, prepares a demo payment proposal, and the user decides whether to approve or discard it.

## Script

1. Ask the tester to open `https://agente-pagos-stellar.vercel.app`.
2. Ask: "What do you think this product does?" after 20 seconds.
3. Ask them to request one service: `Analizar una transaccion`, `Extraer informacion de una web`, `Comprar creditos de API`, `Preparar un sandbox MCP`, or `Generar un audio corto`.
4. Ask them to open the prepared proposal and explain what they think will happen if they approve.
5. Ask them to approve the demo payment or discard it.
6. Ask them to leave anonymous feedback in the Home form.

## Measure

- Did they understand the product without an explanation?
- Did `Modo demo` and `Pago de prueba` feel clear?
- Did they understand that the browser cannot move funds by itself?
- Which words caused hesitation?
- Would they trust this flow for a real low-value payment after more polish?

## Safety Rules

Do not request private keys, emails, RUT, phone numbers, account IDs, customer identifiers or card data. Do not open submit gates. Do not present simulated receipts as real settlement.