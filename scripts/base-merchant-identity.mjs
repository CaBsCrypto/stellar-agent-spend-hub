import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createEncryptedMerchantIdentity,
  decryptMerchantIdentity,
  publicMerchantIdentity,
} from "../src/evmMerchantIdentity.mjs";

const DEFAULT_PATH = resolve(".local-identities", "spendhub-evm-merchant.json");
const action = String(process.argv[2] || "address").toLowerCase();
const outputPath = resolve(readArg("--file") || DEFAULT_PATH);

if (action === "create") {
  const first = await promptSecret("Encryption passphrase: ");
  const second = await promptSecret("Repeat passphrase: ");
  if (first !== second) throw new Error("Passphrases do not match");
  const identity = createEncryptedMerchantIdentity(first);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({
    created: true,
    ...publicMerchantIdentity(identity),
    encryptedFile: outputPath,
    warning: "Back up the encrypted file and passphrase separately. Never upload either to Vercel.",
  }, null, 2));
} else if (action === "verify") {
  const identity = JSON.parse(await readFile(outputPath, "utf8"));
  const passphrase = await promptSecret("Encryption passphrase: ");
  const decrypted = decryptMerchantIdentity(identity, passphrase);
  console.log(JSON.stringify({
    verified: true,
    address: decrypted.address,
    encryptedFile: outputPath,
  }, null, 2));
} else if (action === "address") {
  const identity = JSON.parse(await readFile(outputPath, "utf8"));
  console.log(JSON.stringify({
    ...publicMerchantIdentity(identity),
    encryptedFile: outputPath,
  }, null, 2));
} else {
  throw new Error("Use create, address, or verify");
}

function readArg(name) {
  const prefixed = process.argv.find((value) => value.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function promptSecret(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Merchant identity creation requires an interactive terminal");
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  let value = "";
  try {
    for await (const chunk of process.stdin) {
      for (const character of chunk) {
        if (character === "\u0003") throw new Error("Cancelled");
        if (character === "\r" || character === "\n") {
          process.stdout.write("\n");
          return value;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    }
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  throw new Error("Input closed");
}
