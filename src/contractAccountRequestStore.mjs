import { createHash, randomUUID } from "node:crypto";

export function createPreparedRequestRecord({ request, prepared, now, requestId = randomUUID() }) {
  const createdAt = now();
  return {
    requestId,
    status: "prepared",
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 600_000).toISOString(),
    canonical: request,
    actionDigest: digestCanonical(request),
    unsignedAuthEntryXdr: prepared.unsignedAuthEntryXdr,
    signaturePayloadHex: prepared.signaturePayloadHex,
    authAddress: prepared.authAddress,
  };
}

export function digestCanonical(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}