// Presentation-only translation for values that arrive from the API in English
// (kept English there on purpose: the public API is a neutral, technical
// contract). This maps them to Spanish only for the primary, non-expert pages.
const KIND_LABELS = {
  "direct-payment": "Pago directo verificado",
  "policy-transfer": "Transferencia con politica",
  "guarded-runtime": "Settlement en runtime guardado",
  "mpp-charge": "Cobro MPP oficial",
  "contract-account": "Cuenta de prueba (passkey)",
  "on-chain evidence": "Evidencia en cadena",
  "agent receipt": "Comprobante del agente",
  "agent receipt (simulated)": "Comprobante del agente (pago de prueba)",
};

export function kindLabelEs(kindLabel) {
  const key = String(kindLabel || "").toLowerCase();
  return KIND_LABELS[key] || kindLabel || "Evidencia";
}

const THEME_LABELS = {
  wallet: "Permisos",
  clarity: "Claridad",
  trust: "Confianza",
  evidence: "Evidencia",
  provider: "Proveedores",
  mobile: "Movil",
  pricing: "Precio",
};

export function themeLabelEs(theme) {
  const key = String(theme || "").toLowerCase();
  return THEME_LABELS[key] || theme || "Tema";
}
