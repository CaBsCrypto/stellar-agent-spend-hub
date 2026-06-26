import { sha256Hex } from "./legalContextAdapter.mjs";

export class PrivacyVaultAdapter {
  constructor() {
    this.records = new Map();
  }

  async storeSecret({ secretRef, plaintext, purpose, providerId }) {
    const sealedHash = await sha256Hex(`${providerId}:${purpose}:${plaintext}`);
    this.records.set(secretRef, {
      secretRef,
      providerId,
      purpose,
      sealedSecret: `sealed:v1:${sealedHash.slice(2, 18)}`,
      createdAt: new Date().toISOString(),
    });
    return this.records.get(secretRef);
  }

  getPublicRecord(secretRef) {
    const record = this.records.get(secretRef);
    if (!record) return null;
    return {
      secretRef: record.secretRef,
      providerId: record.providerId,
      purpose: record.purpose,
      sealedSecret: record.sealedSecret,
      createdAt: record.createdAt,
    };
  }
}