import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
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
  if (content.includes("Policy Escrow V2")) {
    throw new Error(`${name} still exposes archived Policy Escrow V2 in the primary narrative`);
  }
}

for (const token of [
  "USD 75,000",
  "$12,000",
  "$18,000",
  "$25,000",
  "$20,000",
  "114/114",
  "31/31",
  "Do not submit until both coordinated USDC testnet settlements are verified",
]) {
  if (!application.includes(token)) throw new Error(`SCF application missing: ${token}`);
}

if (!summaryEs.includes("US$75.000")) throw new Error("Spanish summary has the wrong funding request");

for (const evidence of VERIFIED_FOUNDATIONS) {
  assertEvidenceInvariant(evidence);
  if (!application.includes(evidence.transactionHash)) {
    throw new Error(`SCF application missing verified hash: ${evidence.id}`);
  }
}

for (const pending of [pendingMppEvidence(), pendingContractAccountEvidence()]) {
  assertEvidenceInvariant(pending);
}

if (!dashboard.includes('["Discover", "Authorize", "Policy", "Settle", "Verify"]')) {
  throw new Error("Dashboard trust flow is not the five-step SCF narrative");
}


const buildScript = read("scripts/build-static.mjs");
if (!buildScript.includes('cp("src/client", "public/src/client"') || buildScript.includes('cp("src", "public/src"')) {
  throw new Error("Static build must publish client modules only");
}
if (existsSync(resolve(root, "src/app.mjs")) || existsSync(resolve(root, "src/styles.css"))) {
  throw new Error("Legacy monolithic frontend files still exist");
}

console.log("SCF package consistency: passed");
