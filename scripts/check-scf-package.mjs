import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTRACT_ACCOUNT_ACCEPTANCE,
  VERIFIED_FOUNDATIONS,
  assertEvidenceInvariant,
  pendingContractAccountEvidence,
  pendingMppEvidence,
} from "../src/publicEvidenceCatalog.mjs";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "docs/scf-application.md",
  "docs/scf-executive-summary-es.md",
  "docs/scf-pitch-deck.md",
  "docs/demo-script.md",
  "docs/demo-storyboard.md",
  "docs/scf-acceptance-runbook.md",
  "docs/public-evidence.md",
  "docs/threat-model.md",
  "docs/contract-account-human-acceptance.md",
  "docs/scf-evidence-snapshot.json",
];
for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing SCF package file: ${file}`);
}

const read = (file) => readFileSync(resolve(root, file), "utf8");
const readme = read("README.md");
const dashboard = [
  "src/client/routes.mjs",
  "src/client/components.mjs",
  "src/client/pages/overview.mjs",
  "src/client/pages/evidence.mjs",
].map(read).join("\n");
const application = read("docs/scf-application.md");
const summaryEs = read("docs/scf-executive-summary-es.md");

for (const [name, content] of [["README", readme], ["dashboard", dashboard]]) {
  if (content.includes("Policy Escrow V2")) throw new Error(`${name} exposes archived Policy Escrow V2`);
}

for (const token of [
  "USD 75,000",
  "$12,000",
  "$18,000",
  "$25,000",
  "$20,000",
  "176/176",
  "31/31",
  "8290da7e4da419d824f49da6a8ad21fb7e5117cccf861c923dc21e299e985836",
  "b37ab9217c108b023abcb3905d4fee98d32999b23d800c9471f82aeb646af094",
]) {
  if (!application.includes(token)) throw new Error(`SCF application missing: ${token}`);
}
if (!summaryEs.includes("US$75.000")) throw new Error("Spanish summary has the wrong funding request");
if (!summaryEs.includes("b37ab921...6af094")) throw new Error("Spanish summary is missing Contract Account evidence");

for (const stale of [
  "coordinated USDC settlements remain explicitly pending",
  "human passkey evidence remains pending",
  "Pending supervised Faucet session",
  "submission blocked until both USDC hashes exist",
]) {
  for (const [name, content] of [["README", readme], ["application", application], ["summary", summaryEs]]) {
    if (content.includes(stale)) throw new Error(`${name} contains stale evidence claim: ${stale}`);
  }
}

for (const evidence of VERIFIED_FOUNDATIONS) {
  assertEvidenceInvariant(evidence);
  if (!application.includes(evidence.transactionHash)) throw new Error(`SCF application missing verified hash: ${evidence.id}`);
}
for (const step of ["deploy", "funding", "grant", "payment", "revoke"]) {
  const hash = CONTRACT_ACCOUNT_ACCEPTANCE[step].transactionHash;
  if (!application.includes(hash)) throw new Error(`SCF application missing Contract Account ${step} hash`);
}
for (const pending of [pendingMppEvidence(), pendingContractAccountEvidence()]) assertEvidenceInvariant(pending);

const snapshot = JSON.parse(read("docs/scf-evidence-snapshot.json"));
if (snapshot.coordinatedDemo?.mpp?.verificationStatus !== "verified") throw new Error("Snapshot MPP proof is not verified");
if (snapshot.coordinatedDemo?.contractAccount?.transactionHash !== CONTRACT_ACCOUNT_ACCEPTANCE.payment.transactionHash) {
  throw new Error("Snapshot Contract Account proof is not the accepted payment");
}
if (snapshot.coordinatedDemo.contractAccount.amount !== "0.01" || snapshot.coordinatedDemo.contractAccount.amountBaseUnits !== "100000") {
  throw new Error("Snapshot Contract Account amount is not normalized");
}
if (snapshot.contractAccountLifecycle?.status !== "frozen" || snapshot.contractAccountLifecycle?.revoke?.status !== "verified") {
  throw new Error("Snapshot lifecycle is not frozen by owner revoke");
}
if (snapshot.contractAccountLifecycle.gatesClosed !== true) throw new Error("Snapshot gates are not closed");

if (!dashboard.includes('["Discover", "Authorize", "Policy", "Settle", "Verify"]')) {
  throw new Error("Dashboard trust flow is not the five-step SCF narrative");
}
const buildScript = read("scripts/build-static.mjs");
if (buildScript.includes('cp("src/client", "public/src/client"') || buildScript.includes('cp("src", "public/src"')) {
  throw new Error("Static build must not publish raw source trees");
}
for (const token of ["manifest.webmanifest", "sw.js", "src/client/styles", "src/client/icons"]) {
  if (!buildScript.includes(token)) throw new Error(`Static build missing required asset copy: ${token}`);
}
if (existsSync(resolve(root, "src/app.mjs")) || existsSync(resolve(root, "src/styles.css"))) {
  throw new Error("Legacy monolithic frontend files still exist");
}

console.log("SCF package consistency: passed");