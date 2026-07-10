export const TrustLevel = Object.freeze({
  informational: 1,
  provable: 2,
  signed: 3,
  integrated: 4,
});

export class LegalContextAdapter {
  constructor({ registry = {}, fetchImpl = globalThis.fetch } = {}) {
    this.registry = registry;
    this.fetchImpl = fetchImpl;
  }

  async evaluate(intent, policy) {
    if (!intent.legalContextUrl) {
      return {
        allowed: !policy.requireLegalContext,
        requiresSignature: false,
        reasons: policy.requireLegalContext ? ["Provider does not publish a legal context"] : [],
        evidence: policy.requireLegalContext ? [] : ["Legal context opcional para este pago"],
        snapshot: null,
        termsHash: null,
        trustLevel: 0,
      };
    }

    const reasons = [];
    const evidence = [];
    const context = await this.fetchLegalContext(intent.legalContextUrl);
    const terms = await this.fetchTerms(context.terms);
    const termsHash = await sha256Hex(terms);
    const declaredHash = normalizeHash(context.atrHash);
    const computedTrustLevel = context.trustLevel || (context.acceptanceRequired ? 3 : context.atrHash ? 2 : 1);

    if (declaredHash && declaredHash !== termsHash) {
      reasons.push("ATR hash no coincide con los terminos");
    } else if (declaredHash) {
      evidence.push("Hash de terminos verificado");
    } else {
      evidence.push("Terminos encontrados sin hash");
    }

    if (computedTrustLevel < policy.minLegalTrustLevel) {
      reasons.push(`Nivel de confianza ${computedTrustLevel} bajo el minimo requerido ${policy.minLegalTrustLevel}`);
    } else {
      evidence.push(`Nivel de confianza ${computedTrustLevel} cumple la politica`);
    }

    if (context.acceptanceRequired) {
      evidence.push("Se requiere aceptacion explicita");
    }

    return {
      allowed: reasons.length === 0,
      requiresSignature: Boolean(context.acceptanceRequired),
      reasons,
      evidence,
      snapshot: {
        legalContextUrl: intent.legalContextUrl,
        termsUrl: context.terms,
        atrHash: normalizeHash(context.atrHash) || null,
        acceptanceRequired: Boolean(context.acceptanceRequired),
        trustLevel: computedTrustLevel,
        disputeResolution: context.disputeResolution || null,
      },
      termsHash,
      trustLevel: computedTrustLevel,
    };
  }

  async fetchLegalContext(url) {
    if (this.registry[url]) {
      return this.registry[url].legalContext;
    }

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Legal context unavailable: ${response.status}`);
    }
    return response.json();
  }

  async fetchTerms(url) {
    const registryEntry = Object.values(this.registry).find((entry) => entry.legalContext.terms === url);
    if (registryEntry?.termsText) {
      return registryEntry.termsText;
    }

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Terms unavailable: ${response.status}`);
    }
    return response.text();
  }
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function normalizeHash(value) {
  if (!value) return "";
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}