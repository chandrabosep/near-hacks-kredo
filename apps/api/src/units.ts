/**
 * Credits, USDT units and dollars. 1 credit = $0.01 = 10,000 units, always.
 * Every amount is kept in units (bigint). Credits and dollars exist only at the edges.
 */
export const UNITS_PER_CREDIT = 10_000n;
const CREDIT_DECIMALS = 4; // 1 unit = 0.0001 credits

/** Parses credits ("40", "0.5", 12.25) into units, exactly. Rejects anything finer than one unit. */
export function creditsToUnits(credits: number | string): bigint {
  const s = typeof credits === "number" ? numberToPlain(credits) : credits.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new RangeError(`"${credits}" is not a valid credit amount`);
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > CREDIT_DECIMALS) throw new RangeError(`"${credits}" is finer than 0.0001 credits`);
  return BigInt(m[1]) * UNITS_PER_CREDIT + BigInt(frac.padEnd(CREDIT_DECIMALS, "0") || "0");
}

/** Exact credits as a decimal string, e.g. 400000n -> "40", 5n -> "0.0005". */
export function unitsToCreditsString(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const whole = abs / UNITS_PER_CREDIT;
  const frac = (abs % UNITS_PER_CREDIT).toString().padStart(CREDIT_DECIMALS, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

/** Dollars as a decimal string. 1 credit = $0.01, so 1 unit = $0.000001. */
export function unitsToUsdString(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

/** The shape every amount takes in API responses: exact units plus both display forms. */
export type Amount = { units: string; credits: string; usd: string };

export function amount(units: bigint): Amount {
  return { units: units.toString(), credits: unitsToCreditsString(units), usd: unitsToUsdString(units) };
}

function numberToPlain(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`"${n}" is not a valid credit amount`);
  // toFixed avoids exponent notation; trailing zeros are trimmed by the parser.
  return n.toFixed(CREDIT_DECIMALS + 2);
}
