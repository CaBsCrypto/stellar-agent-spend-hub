const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

export function publicPilotRequest(record) {
  return {
    requestId: record.requestId,
    providerId: record.providerId,
    providerName: record.providerName,
    resourceId: record.resourceId,
    amount: record.amount,
    amountBaseUnits: record.amountBaseUnits,
    asset: record.asset,
    assetContractId: record.assetContractId,
    network: record.network,
    recipient: record.recipient,
    status: record.status,
    requiresHumanConfirmation: !["approved", "settling", "settled"].includes(record.status),
    approvalExpiresAt: record.approvalExpiresAt,
    approvedAt: record.approvedAt,
    transactionHash: record.transactionHash,
    explorerUrl: record.transactionHash ? `${EXPLORER}/${record.transactionHash}` : null,
    createdAt: record.createdAt,
    settledAt: record.settledAt,
  };
}

export function pilotBuyerRequest(record) {
  return {
    ...publicPilotRequest(record),
    resourceUrl: record.resourceUrl,
  };
}

export function publicPilotEvidence(record) {
  return {
    evidenceType: "provider-pilot",
    verificationStatus: "verified",
    providerId: record.providerId,
    resourceId: record.resourceId,
    amount: record.amount,
    amountBaseUnits: record.amountBaseUnits,
    asset: record.asset,
    assetContractId: record.assetContractId,
    network: record.network,
    recipient: record.recipient,
    transactionHash: record.transactionHash,
    explorerUrl: `${EXPLORER}/${record.transactionHash}`,
    verifiedAt: record.settledAt,
  };
}
