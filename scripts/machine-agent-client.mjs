import { assertNoSensitiveData } from "../src/sensitiveDataGuard.mjs";

if (isCliEntrypoint()) {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = options.baseUrl || process.env.SPEND_HUB_URL || "http://localhost:4179";
  const providerId = options.provider || "browserbase-mcp";
  const resource = options.resource || "browser-session-demo";
  const amount = options.amount || "9";
  const approvedBy = options.approvedBy || "agent-client-user-passkey";

  const result = await runMachinePayment({ baseUrl, providerId, resource, amount, approvedBy });
  console.log(JSON.stringify(result, null, 2));
}

export async function runMachinePayment({ baseUrl, providerId, resource, amount, approvedBy }) {
  const firstUrl = `${baseUrl}/api/machine-resource/${encodeURIComponent(providerId)}?resource=${encodeURIComponent(resource)}&amount=${encodeURIComponent(amount)}`;
  const first = await requestJson(firstUrl);
  if (first.status !== 402) {
    throw new Error(`Expected 402 challenge, got ${first.status}`);
  }
  if (!first.body.challenge?.paymentRequest?.intentId) {
    throw new Error("402 challenge missing paymentRequest.intentId");
  }

  const { intentId, prepareUrl, approveUrl } = first.body.challenge.paymentRequest;
  const prepared = await requestJson(resolveApiUrl(baseUrl, prepareUrl), { method: "POST", body: "{}" });
  if (prepared.status !== 200) {
    throw new Error(`Prepare failed with ${prepared.status}`);
  }

  const approved = await requestJson(resolveApiUrl(baseUrl, approveUrl), {
    method: "POST",
    body: JSON.stringify({ approvedBy }),
  });
  if (approved.status !== 200 || !approved.body.receipt?.id) {
    throw new Error(`Approve failed with ${approved.status}`);
  }

  const receiptId = approved.body.receipt.id;
  const retryUrl = `${baseUrl}/api/machine-resource/${encodeURIComponent(providerId)}?resource=${encodeURIComponent(resource)}`;
  const delivered = await requestJson(retryUrl, {
    headers: { "X-Payment-Credential": `receipt:${receiptId}` },
  });
  if (delivered.status !== 200) {
    throw new Error(`Retry failed with ${delivered.status}`);
  }

  const leakScan = assertNoSensitiveData(
    {
      challenge: first.body.challenge,
      prepared: prepared.body.prepared,
      receipt: approved.body.receipt,
      resource: delivered.body,
    },
    "machineAgentClientTranscript",
  );
  if (!leakScan.allowed) {
    throw new Error(leakScan.reasons.join("; "));
  }

  return {
    ok: true,
    providerId,
    resource,
    challengeStatus: first.status,
    intentId,
    preparedKind: prepared.body.prepared?.rail || prepared.body.prepared?.credentialType || "unknown",
    receiptId,
    receiptRail: approved.body.receipt.rail,
    resourceStatus: delivered.status,
    deliveredResourceId: delivered.body.resource?.id,
    privacy: {
      sensitivePayloadAllowed: leakScan.allowed,
      findings: leakScan.findings,
    },
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json();
  return { status: response.status, body };
}

function resolveApiUrl(baseUrl, pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${baseUrl}${pathOrUrl}`;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}