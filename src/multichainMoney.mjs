const DECIMAL_PATTERN = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export function parseTokenAmount(amount, decimals) {
  const precision = validateDecimals(decimals);
  const value = String(amount ?? "").trim();
  const match = value.match(DECIMAL_PATTERN);
  if (!match) throw httpError(400, "Amount must be a positive decimal string");
  const fraction = match[2] || "";
  if (fraction.length > precision) throw httpError(400, `Amount exceeds ${precision} decimal places`);
  const baseUnits = `${match[1]}${fraction.padEnd(precision, "0")}`.replace(/^0+(?=\d)/, "");
  if (BigInt(baseUnits || "0") <= 0n) throw httpError(400, "Amount must be greater than zero");
  return {
    amount: formatTokenAmount(baseUnits || "0", precision),
    amountBaseUnits: baseUnits || "0",
    decimals: precision,
  };
}

export function formatTokenAmount(baseUnits, decimals) {
  const precision = validateDecimals(decimals);
  const units = String(baseUnits ?? "");
  if (!/^\d+$/.test(units)) throw httpError(400, "Base units must be an unsigned integer string");
  const padded = units.padStart(precision + 1, "0");
  const whole = padded.slice(0, -precision) || "0";
  if (precision === 0) return whole;
  const fraction = padded.slice(-precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function compareBaseUnits(left, right) {
  return BigInt(String(left)) === BigInt(String(right))
    ? 0
    : BigInt(String(left)) > BigInt(String(right))
      ? 1
      : -1;
}

export function scaleBaseUnits(baseUnits, fromDecimals, toDecimals) {
  const source = validateDecimals(fromDecimals);
  const target = validateDecimals(toDecimals);
  const units = BigInt(String(baseUnits));
  if (target === source) return units.toString();
  if (target > source) return (units * (10n ** BigInt(target - source))).toString();
  const divisor = 10n ** BigInt(source - target);
  if (units % divisor !== 0n) throw httpError(409, "Amount cannot be represented exactly at destination precision");
  return (units / divisor).toString();
}

function validateDecimals(value) {
  const decimals = Number(value);
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw httpError(400, "Unsupported token decimals");
  }
  return decimals;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
