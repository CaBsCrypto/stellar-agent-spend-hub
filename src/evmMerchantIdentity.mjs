import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const VERSION = "spendhub-evm-merchant-v1";
const NETWORK = "eip155:84532";

export function createEncryptedMerchantIdentity(passphrase, { now = () => new Date() } = {}) {
  const password = validatePassphrase(passphrase);
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const encryptionKey = scryptSync(password, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privateKey.slice(2), "hex")),
    cipher.final(),
  ]);
  const value = {
    version: VERSION,
    network: NETWORK,
    address: account.address,
    encryption: {
      cipher: "aes-256-gcm",
      kdf: "scrypt",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    },
    createdAt: now().toISOString(),
  };
  return Object.freeze(value);
}

export function decryptMerchantIdentity(identity, passphrase) {
  validateIdentity(identity);
  const password = validatePassphrase(passphrase);
  const salt = Buffer.from(identity.encryption.salt, "base64");
  const iv = Buffer.from(identity.encryption.iv, "base64");
  const tag = Buffer.from(identity.encryption.tag, "base64");
  const ciphertext = Buffer.from(identity.encryption.ciphertext, "base64");
  try {
    const encryptionKey = scryptSync(password, salt, 32);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(tag);
    const secret = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const privateKey = `0x${secret.toString("hex")}`;
    const account = privateKeyToAccount(privateKey);
    const expected = Buffer.from(identity.address.toLowerCase());
    const actual = Buffer.from(account.address.toLowerCase());
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error("Merchant identity address mismatch");
    }
    return { address: account.address, privateKey };
  } catch {
    throw httpError(401, "Merchant identity passphrase is incorrect or the file is corrupted");
  }
}

export function publicMerchantIdentity(identity) {
  validateIdentity(identity);
  return {
    version: identity.version,
    network: identity.network,
    address: identity.address,
    createdAt: identity.createdAt,
  };
}

function validateIdentity(identity) {
  if (
    !identity
    || identity.version !== VERSION
    || identity.network !== NETWORK
    || !/^0x[a-fA-F0-9]{40}$/.test(String(identity.address || ""))
    || identity.encryption?.cipher !== "aes-256-gcm"
    || identity.encryption?.kdf !== "scrypt"
  ) {
    throw httpError(400, "Encrypted merchant identity is invalid");
  }
}

function validatePassphrase(value) {
  const passphrase = String(value || "");
  if (passphrase.length < 14 || passphrase.length > 256) {
    throw httpError(400, "Merchant identity passphrase must contain 14 to 256 characters");
  }
  return passphrase;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
