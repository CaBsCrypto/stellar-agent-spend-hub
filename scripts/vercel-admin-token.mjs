import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const token = randomBytes(32).toString("base64url");
const environments = (process.env.VERCEL_TARGET_ENVS || "production,preview").split(",").map((value) => value.trim()).filter(Boolean);

for (const environment of environments) {
  await addSensitiveEnv("TESTNET_PAYMENT_ADMIN_TOKEN", environment, token);
}

await mkdir(".vercel", { recursive: true });
await writeFile(".vercel/testnet-payment-admin-token.local", `TESTNET_PAYMENT_ADMIN_TOKEN=${token}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  variable: "TESTNET_PAYMENT_ADMIN_TOKEN",
  environments,
  localTokenFile: ".vercel/testnet-payment-admin-token.local",
  tokenPrinted: false,
}, null, 2));

async function addSensitiveEnv(name, environment, value) {
  await new Promise((resolve, reject) => {
    const child = spawn("vercel", ["env", "add", name, environment, "--force", "--yes", "--sensitive"], {
      cwd: process.cwd(),
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdin.write(value);
    child.stdin.end();
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString().replaceAll(value, "[REDACTED_TOKEN]");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`vercel env add ${name} ${environment} failed: ${stderr}`));
    });
  });
}
