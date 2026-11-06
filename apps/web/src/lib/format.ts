/** Every amount from the API: exact USDT units plus both display forms. 1 credit = $0.01. */
export type Amount = { units: string; credits: string; usd: string };

/** "1,250.5 credits", "1 credit". */
export function credits(a: Amount | string, opts: { unit?: boolean } = {}): string {
  const raw = typeof a === "string" ? a : a.credits;
  const [whole, frac] = raw.split(".");
  const n = Number(whole).toLocaleString("en-US") + (frac ? `.${frac}` : "");
  if (opts.unit === false) return n;
  return `${n} ${raw === "1" ? "credit" : "credits"}`;
}

/** "$12.50", "$0.0095". Never rounds below a cent away. */
export function usd(a: Amount | string): string {
  const raw = typeof a === "string" ? a : a.usd;
  const [whole, frac = ""] = raw.split(".");
  const cents = frac.length <= 2 ? frac.padEnd(2, "0") : frac;
  return `$${Number(whole).toLocaleString("en-US")}.${cents}`;
}

/** 0xA81a…e3EF */
export function short(address: string | undefined, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** "just now", "5 min ago", "3 h ago", then a date. */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Exact dollars for a credit amount typed by a person, as a decimal string. "250" -> "2.5". */
export function creditsToUsd(creditAmount: string): string {
  const [whole, frac = ""] = creditAmount.split(".");
  const units = BigInt(whole) * BigInt(10_000) + BigInt(frac.padEnd(4, "0").slice(0, 4) || "0");
  const million = BigInt(1_000_000);
  const w = units / million;
  const f = (units % million).toString().padStart(6, "0").replace(/0+$/, "");
  return f ? `${w}.${f}` : `${w}`;
}

/** Credits typed by a person: digits and at most 4 decimals, more than zero. */
export function parseCredits(input: string): string | undefined {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,4})?$/.test(s) || Number(s) <= 0) return undefined;
  return s;
}

/** Only same-site or http(s) return links, so a crafted link can't run script on our page. */
export function safeReturnTo(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
