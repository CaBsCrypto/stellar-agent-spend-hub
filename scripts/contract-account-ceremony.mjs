const DEFAULT_ENDPOINT = "https://agente-pagos-stellar.vercel.app";

if (isCliEntrypoint()) {
  const ceremonyId = readArg(process.argv, "--ceremony");
  const deploy = process.argv.includes("--deploy");
  runContractAccountCeremony({
    ceremonyId,
    deploy,
    endpoint: readArg(process.argv, "--endpoint") || DEFAULT_ENDPOINT,
    token: process.env.CONTRACT_ACCOUNT_DEPLOY_ADMIN_TOKEN || "",
  }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
    process.exitCode = 1;
  });
}

export async function runContractAccountCeremony({
  ceremonyId,
  deploy = false,
  endpoint = DEFAULT_ENDPOINT,
  token = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  validateCeremonyId(ceremonyId);
  const base = validateEndpoint(endpoint);
  if (!deploy) {
    const response = await fetchImpl(new URL(`/api/contract-account/ceremony/${ceremonyId}`, base));
    const body = await readResponse(response);
    if (!response.ok) throw new Error(body.error || `Ceremony status failed with ${response.status}`);
    return { ok: true, mode: "status", endpoint: base.origin, ceremony: body };
  }
  if (token.length < 32) throw new Error("CONTRACT_ACCOUNT_DEPLOY_ADMIN_TOKEN is required for deploy");
  const response = await fetchImpl(new URL("/api/admin/contract-account/deploy", base), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ceremonyId }),
  });
  const body = await readResponse(response);
  if (!response.ok) throw new Error(body.error || `Ceremony deploy failed with ${response.status}`);
  return {
    ok: true,
    mode: "deployed",
    network: body.network,
    ceremonyId: body.ceremonyId,
    contractId: body.contractId,
    transactionHash: body.transactionHash,
    ownerType: body.ownerType,
    ceremonyStatus: body.ceremonyStatus,
    next: [
      "Close CONTRACT_ACCOUNT_DEPLOY_ENABLED",
      "Set CONTRACT_ACCOUNT_ID to the public contract ID",
      "Fund exactly 0.02 USDC testnet",
      "Enable submit only for grant and the supervised payment",
    ],
  };
}

function validateEndpoint(value) {
  const url = new URL(value);
  const allowed = url.hostname === "agente-pagos-stellar.vercel.app"
    || url.hostname === "localhost"
    || url.hostname === "127.0.0.1";
  if (!allowed || !["https:", "http:"].includes(url.protocol)) {
    throw new Error("Ceremony endpoint is not allowlisted");
  }
  return url;
}

function validateCeremonyId(value) {
  if (!/^[0-9a-f-]{36}$/i.test(value || "")) throw new Error("A valid --ceremony UUID is required");
}

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function readArg(argv, name) {
  const value = argv.find((item) => item.startsWith(`${name}=`));
  return value?.slice(name.length + 1) || null;
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const argvPath = process.argv[1].replaceAll("\\", "/");
  return import.meta.url === new URL(`file:///${argvPath.replace(/^\/+/, "")}`).href;
}
