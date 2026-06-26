import { spawn } from "node:child_process";
import { Keypair } from "@stellar/stellar-sdk";

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";
const ENVIRONMENTS = (process.env.VERCEL_TARGET_ENVS || "production,preview")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const roles = [
  { role: "deployer", publicName: "SPENDHUB_DEPLOYER_PUBLIC_KEY", secretName: "SPENDHUB_DEPLOYER_SECRET_KEY", alsoGenericSource: true },
  { role: "userDemo", publicName: "SPENDHUB_USER_DEMO_PUBLIC_KEY", secretName: "SPENDHUB_USER_DEMO_SECRET_KEY" },
  { role: "agentSession", publicName: "SPENDHUB_AGENT_SESSION_PUBLIC_KEY", secretName: "SPENDHUB_AGENT_SESSION_SECRET_KEY" },
  { role: "merchantDemo", publicName: "SPENDHUB_MERCHANT_DEMO_PUBLIC_KEY", secretName: "SPENDHUB_MERCHANT_DEMO_SECRET_KEY", alsoGenericDestination: true },
];

const keypairs = roles.map((entry) => {
  const keypair = Keypair.random();
  return {
    ...entry,
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
});

const publicSummary = [];
for (const key of keypairs) {
  await fundWithFriendbot(key.publicKey);
  await addVercelEnv(key.publicName, key.publicKey, { sensitive: false });
  await addVercelEnv(key.secretName, key.secretKey, { sensitive: true });

  if (key.alsoGenericSource) {
    await addVercelEnv("STELLAR_PUBLIC_KEY", key.publicKey, { sensitive: false });
    await addVercelEnv("STELLAR_SECRET_KEY", key.secretKey, { sensitive: true });
    await addVercelEnv("STELLAR_HORIZON_URL", HORIZON_URL, { sensitive: false });
    await addVercelEnv("STELLAR_TEST_AMOUNT_XLM", "0.000001", { sensitive: false });
    await addVercelEnv("STELLAR_SUBMIT_ENABLED", "false", { sensitive: false });
  }

  if (key.alsoGenericDestination) {
    await addVercelEnv("STELLAR_TEST_DESTINATION", key.publicKey, { sensitive: false });
  }

  publicSummary.push({ role: key.role, publicKey: key.publicKey });
}

console.log(JSON.stringify({
  ok: true,
  horizonUrl: HORIZON_URL,
  environments: ENVIRONMENTS,
  publicKeys: publicSummary,
  secretsPrinted: false,
  nextSteps: [
    "Run vercel env ls to confirm variables exist without revealing values.",
    "Run vercel env pull .env.local --yes only if local execution needs the same Vercel envs.",
    "Keep STELLAR_SUBMIT_ENABLED=false until the supervised tiny testnet payment.",
  ],
}, null, 2));

async function fundWithFriendbot(publicKey) {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Friendbot failed for ${publicKey.slice(0, 6)}...${publicKey.slice(-6)}: HTTP ${response.status} ${text.slice(0, 120)}`);
  }
}

async function addVercelEnv(name, value, { sensitive }) {
  for (const environment of ENVIRONMENTS) {
    await runVercelEnvAdd(name, environment, value, { sensitive });
  }
}

async function runVercelEnvAdd(name, environment, value, { sensitive }) {
  const args = ["env", "add", name, environment, "--force", "--yes"];
  if (sensitive) args.push("--sensitive");

  await new Promise((resolve, reject) => {
    const child = spawn("vercel", args, {
      cwd: process.cwd(),
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdin.write(value);
    child.stdin.end();
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`vercel env add ${name} ${environment} failed: ${redact(stderr)}`));
    });
  });
}

function redact(text) {
  let next = text;
  for (const key of keypairs) {
    next = next.replaceAll(key.secretKey, "[REDACTED_SECRET]");
  }
  return next;
}

