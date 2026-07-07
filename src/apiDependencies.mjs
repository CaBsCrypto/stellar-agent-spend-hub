import { BaseX402Service } from "./baseX402Service.mjs";
import { ContractAccountCeremonyService } from "./contractAccountCeremony.mjs";
import { ContractAccountRelayer } from "./contractAccountRelayer.mjs";
import { MppChargeService } from "./mppChargeService.mjs";
import { MppReceiptRepository } from "./mppReceiptRepository.mjs";
import { MultichainService } from "./multichainService.mjs";
import { PilotRateLimiter } from "./pilotRateLimit.mjs";
import { PilotService } from "./pilotService.mjs";
import { PublicEvidenceService } from "./publicEvidenceService.mjs";

export function createDependencies(env) {
  let mpp;
  let receipts;
  let contractAccount;
  let evidence;
  let contractAccountCeremonies;
  let pilot;
  let pilotRateLimiter;
  let multichain;
  let baseX402;

  return {
    mpp: () => (mpp ||= new MppChargeService({ env })),
    mppReceipts: () => (receipts ||= new MppReceiptRepository({ env })),
    contractAccount: () => (contractAccount ||= new ContractAccountRelayer({ env })),
    publicEvidence: () => (evidence ||= new PublicEvidenceService({ env })),
    contractAccountCeremonies: () => (
      contractAccountCeremonies ||= new ContractAccountCeremonyService({ env })
    ),
    pilot: () => (pilot ||= new PilotService({ env })),
    pilotRateLimiter: () => (pilotRateLimiter ||= new PilotRateLimiter({ env })),
    multichain: () => (multichain ||= new MultichainService({ env })),
    baseX402: () => (baseX402 ||= new BaseX402Service({
      env,
      onSettlement: (receipt) => (
        multichain ||= new MultichainService({ env })
      ).verifyAndRecordSettlement(receipt),
    })),
  };
}
