import { sha256Hex } from "./legalContextAdapter.mjs";

export class ZkCommitmentAdapter {
  async createCommitment({ providerId, secretRef, salt }) {
    return sha256Hex(`${providerId}:${secretRef}:${salt}`);
  }

  async createProof({ providerId, secretRef, salt, purpose }) {
    const commitment = await this.createCommitment({ providerId, secretRef, salt });
    const proofHash = await sha256Hex(`proof:${commitment}:${purpose}`);
    return {
      proofStatus: "valid",
      proofType: "demo-commitment-membership",
      providerId,
      commitment,
      proofHash,
      publicSignals: {
        providerId,
        purpose,
        statement: "User can prove possession of a private service identifier without revealing it.",
      },
    };
  }

  evaluate(intent, proof) {
    if (!intent.proofRequired) {
      return {
        allowed: true,
        reasons: [],
        evidence: ["Proof opcional para este intento"],
        proofHash: null,
        commitment: intent.secretRefCommitment || null,
        privacyLevel: intent.privacyRequirement || "standard",
      };
    }

    if (!proof || proof.proofStatus !== "valid") {
      return {
        allowed: false,
        reasons: ["Proof ZK requerido antes de pagar"],
        evidence: [],
        proofHash: null,
        commitment: intent.secretRefCommitment || null,
        privacyLevel: intent.privacyRequirement || "zk-required",
      };
    }

    if (intent.secretRefCommitment && proof.commitment !== intent.secretRefCommitment) {
      return {
        allowed: false,
        reasons: ["Commitment no coincide con el proof"],
        evidence: [],
        proofHash: proof.proofHash,
        commitment: proof.commitment,
        privacyLevel: intent.privacyRequirement || "zk-required",
      };
    }

    return {
      allowed: true,
      reasons: [],
      evidence: ["Proof ZK demo verificado", "Identificador privado nunca se revela"],
      proofHash: proof.proofHash,
      commitment: proof.commitment,
      privacyLevel: intent.privacyRequirement || "zk-required",
    };
  }
}