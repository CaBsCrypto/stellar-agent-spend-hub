import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

const sourceUrl = process.env.SCF_EVIDENCE_URL || "https://agente-pagos-stellar.vercel.app/api/evidence";
const outputPath = resolve(import.meta.dirname, "../docs/scf-evidence-snapshot.json");

const response = await fetch(sourceUrl, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`Evidence API returned ${response.status}`);
const manifest = await response.json();
validateSubmissionEvidence(manifest);

const snapshot = {
  snapshotVersion: "scf-submission-evidence-v1",
  capturedAt: new Date().toISOString(),
  sourceUrl,
  network: manifest.network,
  coordinatedDemo: manifest.coordinatedDemo,
  contractAccountLifecycle: manifest.contractAccountLifecycle,
};
const scan = assertNoSensitiveData(snapshot, "scfEvidenceSnapshot");
if (!scan.allowed) throw new Error("Sensitive data blocked from SCF evidence snapshot");
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`SCF evidence snapshot written: ${outputPath}`);

export function validateSubmissionEvidence(manifest) {
  const mpp = manifest?.coordinatedDemo?.mpp;
  const account = manifest?.coordinatedDemo?.contractAccount;
  const lifecycle = manifest?.contractAccountLifecycle;
  if (mpp?.verificationStatus !== "verified" || account?.verificationStatus !== "verified") {
    throw new Error("Both coordinated USDC proofs must be verified");
  }
  if (account.amount !== "0.01" || account.amountBaseUnits !== "100000") {
    throw new Error("Contract Account amount must be normalized to 0.01 USDC");
  }
  if (lifecycle?.payment?.transactionHash !== account.transactionHash) {
    throw new Error("Lifecycle payment must match coordinated Contract Account evidence");
  }
  if (!lifecycle?.replay?.rejected || lifecycle.replay.replaySubmitStatus !== 409) {
    throw new Error("Replay rejection evidence is incomplete");
  }
  if (lifecycle?.revoke?.status !== "verified" || lifecycle.status !== "frozen") {
    throw new Error("Contract Account revoke must be verified before evidence freeze");
  }
  if (lifecycle.gatesClosed !== true) throw new Error("Submission gates must be closed");
  return manifest;
}