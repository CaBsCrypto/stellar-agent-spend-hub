const baseUrl = new URL(readArg("--url") || process.env.BASE_ACCEPTANCE_URL || "https://agente-pagos-stellar.vercel.app");
const requireReady = process.argv.includes("--require-ready");

const response = await fetch(new URL("/api/x402/base-readiness", baseUrl), {
  headers: { Accept: "application/json" },
});
const report = await response.json();
if (!response.ok) throw new Error(report.error || `Readiness failed with HTTP ${response.status}`);

console.log(JSON.stringify({
  target: baseUrl.origin,
  status: report.status,
  configurationReady: report.configurationReady,
  infrastructureReady: report.infrastructureReady,
  executionReady: report.executionReady,
  safeClosed: report.safeClosed,
  checks: report.checks,
  nextSteps: report.nextSteps,
}, null, 2));

if (requireReady && !report.executionReady) process.exitCode = 1;

function readArg(name) {
  const prefixed = process.argv.find((value) => value.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
