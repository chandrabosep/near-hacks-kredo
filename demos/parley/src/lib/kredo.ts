/**
 * Everything Parley needs from Kredo, on the server. The API key never leaves this file.
 */
import { Credits, CreditsError } from "kredo";
import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Parley's price list, in credits. 1 credit = $0.01. */
export const PRICES = {
  "chat.pro": { price: 4 },
  "chat.fast": { price: 1 },
} as const;

export type PriceAction = keyof typeof PRICES;

/** The deployed site, from Vercel. Unset when running locally. */
const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;

/** How Parley appears in the Kredo directory. */
const listing = () => ({
  description: "Chat with Claude, paid per message with Kredo credits. Pick Fast for quick answers or Pro for hard problems. If a reply fails, the credit is refunded.",
  category: "ai" as const,
  ...(SITE && { website: SITE, logoUrl: `${SITE}/icon.svg` }),
});

let client: Credits | undefined;
let priced: Promise<unknown> | undefined;

/** The Kredo client, with Parley's prices and directory listing set once per server start. */
export async function kredo(): Promise<Credits> {
  if (!process.env.CREDITS_API_KEY) {
    throw new CreditsError("Parley isn't set up yet: add CREDITS_API_KEY to .env.local", 503, "not_configured");
  }
  client ??= new Credits({
    apiKey: process.env.CREDITS_API_KEY,
    baseUrl: process.env.CREDITS_API_URL,
    pagesUrl: process.env.NEXT_PUBLIC_CREDITS_PAGES_URL,
  });
  // The listing is best effort: billing works without it.
  priced ??= Promise.all([client.setPrices(PRICES), client.setProfile(listing()).catch(() => undefined)]).catch((err) => {
    priced = undefined;
    throw err;
  });
  await priced;
  return client;
}

// ---------------------------------------------------------------- Parley's own sessions

/**
 * A real app links the Kredo user to its own account system. Parley has no accounts, so the
 * Kredo account and email this browser connected live in an httpOnly cookie, signed so the
 * browser can't swap in someone else's account. Nothing is stored on the server.
 */
const COOKIE = "parley_link";
const MAX_AGE = 60 * 60 * 24 * 365;

type Linked = { account: string; email: string | null };

/** PARLEY_SESSION_SECRET if set, otherwise derived from the API key, which is already secret. */
function secret(): string {
  const base = process.env.PARLEY_SESSION_SECRET ?? process.env.CREDITS_API_KEY;
  if (!base) throw new CreditsError("Parley isn't set up yet: add CREDITS_API_KEY to .env.local", 503, "not_configured");
  return createHash("sha256").update(`parley-session:${base}`).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

async function linked(): Promise<Linked | undefined> {
  const value = (await cookies()).get(COOKIE)?.value;
  const [payload, mac] = value?.split(".") ?? [];
  if (!payload || !mac) return undefined;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Linked;
  } catch {
    return undefined;
  }
}

/** The Kredo account this browser connected, if any. Never taken from the request body. */
export async function currentUser(): Promise<string | undefined> {
  return (await linked())?.account;
}

/** The email the user shared when they connected Parley, if any. */
export async function currentEmail(): Promise<string | null> {
  return (await linked())?.email ?? null;
}

export async function linkUser(account: string, email: string | null) {
  const payload = Buffer.from(JSON.stringify({ account, email } satisfies Linked)).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function unlinkUser() {
  (await cookies()).delete(COOKIE);
}

/** Turns any thrown error into a JSON response the UI can act on. */
export function errorResponse(err: unknown): Response {
  if (err instanceof CreditsError) {
    const status = err.isDeclined ? 402 : err.status >= 400 ? err.status : 502;
    return Response.json({ error: err.message, code: err.code, declined: err.isDeclined }, { status });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong on our side.", code: "error" }, { status: 500 });
}
