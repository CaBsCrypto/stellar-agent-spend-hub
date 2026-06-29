const STORAGE_KEY = "spendhub-passkey-v1";
const RP_ID = "agente-pagos-stellar.vercel.app";

export function passkeySupported() {
  return Boolean(window.PublicKeyCredential && navigator.credentials);
}

export function loadLocalPasskey() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export async function createDemoPasskey() {
  if (!passkeySupported()) throw new Error("This browser does not support passkeys.");
  const rpId = location.hostname === "localhost" ? "localhost" : RP_ID;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: "Stellar Agent Spend Hub" },
      user: { id: userId, name: "demo-owner", displayName: "Spend Hub Owner" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      attestation: "none",
      timeout: 60_000,
    },
  });
  if (!credential?.response?.getPublicKey) throw new Error("The authenticator did not expose a public key.");
  const publicKeyDer = new Uint8Array(credential.response.getPublicKey());
  const publicKey = publicKeyDer.slice(-65);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("Unexpected P-256 public key.");
  const credentialId = new Uint8Array(credential.rawId);
  const registration = {
    credentialId: toBase64Url(credentialId),
    credentialIdHash: toHex(await sha256(credentialId)),
    publicKey: toHex(publicKey),
    rpId,
    rpIdHash: toHex(await sha256(new TextEncoder().encode(rpId))),
    originHash: toHex(await sha256(new TextEncoder().encode(location.origin))),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registration));
  return publicRegistration(registration);
}

export async function signPasskeyPayload(signaturePayloadHex) {
  const stored = loadLocalPasskey();
  if (!stored) throw new Error("Create the demo passkey first.");
  const challenge = fromHex(signaturePayloadHex);
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: stored.rpId,
      allowCredentials: [{
        type: "public-key",
        id: fromBase64Url(stored.credentialId),
      }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!credential?.response) throw new Error("No se recibió una assertion WebAuthn.");
  return {
    type: "passkey",
    credentialIdHash: toBase64Url(fromHex(stored.credentialIdHash)),
    authenticatorData: toBase64Url(new Uint8Array(credential.response.authenticatorData)),
    clientDataJson: toBase64Url(new Uint8Array(credential.response.clientDataJSON)),
    signature: toBase64Url(compactLowSSignature(new Uint8Array(credential.response.signature))),
  };
}

export function publicRegistration(value = loadLocalPasskey()) {
  if (!value) return null;
  return {
    publicKey: value.publicKey,
    credentialIdHash: value.credentialIdHash,
    rpId: value.rpId,
    rpIdHash: value.rpIdHash,
    originHash: value.originHash,
    createdAt: value.createdAt,
  };
}

function compactLowSSignature(der) {
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 2) throw new Error("Firma DER inválida.");
  const rLength = der[offset + 1];
  const r = der.slice(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;
  if (der[offset] !== 2) throw new Error("Firma DER inválida.");
  const sLength = der[offset + 1];
  const s = der.slice(offset + 2, offset + 2 + sLength);
  const output = new Uint8Array(64);
  output.set(r.slice(-32), 32 - Math.min(32, r.length));
  const sBytes = new Uint8Array(32);
  sBytes.set(s.slice(-32), 32 - Math.min(32, s.length));
  const curveOrder = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const sValue = bytesToBigInt(sBytes);
  output.set(bigIntToBytes(sValue > curveOrder / 2n ? curveOrder - sValue : sValue, 32), 32);
  return output;
}

function bytesToBigInt(bytes) {
  return BigInt(`0x${toHex(bytes)}`);
}

function bigIntToBytes(value, length) {
  return fromHex(value.toString(16).padStart(length * 2, "0"));
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function toHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value) {
  if (!/^[a-f0-9]+$/i.test(value || "") || value.length % 2 !== 0) throw new Error("Hex inválido.");
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
