import { paymentIntents, receipts } from "./mockData.mjs";

export const defaultSpendHubState = () => ({
  intents: paymentIntents.map((intent) => ({ ...intent, status: intent.status || "created" })),
  receipts,
  proofs: {},
  vaultRecords: {},
  spendRequests: {},
  machineChallenges: {},
  idempotencyKeys: {},
  sorobanExecutions: {},
});

export function normalizeSpendHubState(state) {
  const normalized = {
    intents: state.intents || [],
    receipts: state.receipts || [],
    proofs: state.proofs || {},
    vaultRecords: state.vaultRecords || {},
    spendRequests: state.spendRequests || {},
    machineChallenges: state.machineChallenges || {},
    idempotencyKeys: state.idempotencyKeys || {},
    sorobanExecutions: state.sorobanExecutions || {},
  };
  normalized.intents = normalized.intents.map((intent) => ({
    ...intent,
    status: intent.status || "created",
  }));
  return normalized;
}
