import { setupTestnet } from "./setup-testnet.mjs";

const report = await setupTestnet({ root: process.cwd(), env: process.env });
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
