export const SensitiveField = Object.freeze({
  rut: "rut",
  email: "email",
  phone: "phone",
  card: "card",
  accountNumber: "accountNumber",
  clientSecret: "clientSecret",
});

const sensitivePatterns = [
  { type: SensitiveField.email, pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { type: SensitiveField.rut, pattern: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/ },
  { type: SensitiveField.phone, pattern: /\b(?:\+?56)?\s?9\s?\d{4}\s?\d{4}\b/ },
  { type: SensitiveField.card, pattern: /\b(?:\d[ -]*?){13,19}\b/ },
  { type: SensitiveField.accountNumber, pattern: /\b(?:customer|cuenta|account|client|cliente|subscription)[-_\s:]?\d{5,}\b/i },
  { type: SensitiveField.clientSecret, pattern: /\b(?:sk|pk|rk|whsec|pi|seti|cs)_(?:live|test)?_[a-z0-9_]{8,}\b/i },
];

export function findSensitiveData(value, path = "root") {
  const findings = [];
  scanValue(value, path, findings);
  return findings;
}

export function assertNoSensitiveData(value, path = "root") {
  const findings = findSensitiveData(value, path);
  return {
    allowed: findings.length === 0,
    findings,
    reasons: findings.map((finding) => `Dato sensible detectado en ${finding.path}: ${finding.type}`),
  };
}

function isPublicBlockchainArtifact(value, path) {
  const normalized = value.trim();
  const lowerPath = path.toLowerCase();
  if (/^[CG][A-Z2-7]{55}$/.test(normalized)) return true;
  if (/^[0-9a-f]{64}$/i.test(normalized)) return true;
  if (/\bxdr\b/i.test(lowerPath) && normalized.length >= 64 && normalized.length <= 16_384 && /^[A-Za-z0-9+/=]+$/.test(normalized)) return true;
  return false;
}
function scanValue(value, path, findings) {
  if (value == null) return;

  if (typeof value === "string") {
    if (isPublicBlockchainArtifact(value, path)) return;
    for (const rule of sensitivePatterns) {
      if (rule.pattern.test(value)) {
        findings.push({ type: rule.type, path });
      }
    }
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, findings));
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      scanValue(child, `${path}.${key}`, findings);
    }
  }
}
