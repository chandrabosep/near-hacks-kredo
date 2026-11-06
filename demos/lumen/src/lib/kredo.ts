/**
 * Everything Lumen needs from Kredo, on the server. The API key never leaves this file.
 */
import { Credits, CreditsError } from "kredo";
import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { IMAGE_MODELS, VIDEO_MODELS } from "./models";

/** Lumen's price list, in credits: per image for stills, per second for video. */
export const PRICES = {
  [IMAGE_MODELS.flash.action]: { rate: IMAGE_MODELS.flash.credits, unit: "image" },
  [IMAGE_MODELS.pro.action]: { rate: IMAGE_MODELS.pro.credits, unit: "image" },
  [VIDEO_MODELS.motion.action]: { rate: VIDEO_MODELS.motion.credits, unit: "second" },
  [VIDEO_MODELS.cinema.action]: { rate: VIDEO_MODELS.cinema.credits, unit: "second" },
};

const NOT_CONFIGURED = "Lumen isn't set up yet: add CREDITS_API_KEY to .env.local";

let client: Credits | undefined;
let priced: Promise<unknown> | undefined;

/** The Kredo client, with Lumen's prices set once per server start. */
export async function kredo(): Promise<Credits> {
  if (!process.env.CREDITS_API_KEY) throw new CreditsError(NOT_CONFIGURED, 503, "not_configured");
  client ??= new Credits({
    apiKey: process.env.CREDITS_API_KEY,
    baseUrl: process.env.CREDITS_API_URL,
    pagesUrl: process.env.NEXT_PUBLIC_CREDITS_PAGES_URL,
  });
  priced ??= client.setPrices(PRICES).catch((err) => {
    priced = undefined;
    throw err;
  });
  await priced;
  return client;
}

// ---------------------------------------------------------------- signed values

/** LUMEN_SESSION_SECRET if set, otherwise derived from the API key, which is already secret. */
function secret(): string {
  const base = process.env.LUMEN_SESSION_SECRET ?? process.env.CREDITS_API_KEY;
  if (!base) throw new CreditsError(NOT_CONFIGURED, 503, "not_configured");
  return createHash("sha256").update(`lumen-session:${base}`).digest("hex");
}

const mac = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** Packs a value into a string the browser can carry but not change. */
export function seal(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function unseal<T>(token: string | undefined | null): T | undefined {
  const [payload, given] = token?.split(".") ?? [];
  if (!payload || !given) return undefined;
  const a = Buffer.from(mac(payload));
  const b = Buffer.from(given);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- Lumen's own sessions

/**
 * A real app links the Kredo user to its own accounts. Lumen has none, so the Kredo address and
 * email this browser connected live in a signed httpOnly cookie. Nothing is stored on the server.
 */
const COOKIE = "lumen_link";
const MAX_AGE = 60 * 60 * 24 * 365;

type Linked = { address: string; email: string | null };

const linked = async () => unseal<Linked>((await cookies()).get(COOKIE)?.value);

/** The Kredo address this browser connected, if any. Never taken from the request body. */
export async function currentUser(): Promise<string | undefined> {
  return (await linked())?.address;
}

export async function currentEmail(): Promise<string | null> {
  return (await linked())?.email ?? null;
}

export async function linkUser(address: string, email: string | null) {
  (await cookies()).set(COOKIE, seal({ address, email } satisfies Linked), {
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

/** The parts of a Kredo operation the UI shows: what it cost and where to see it onchain. */
export const receipt = (op: { amount: { credits: string; usd: string }; txHash: string; explorer?: string }) => ({
  credits: op.amount.credits,
  usd: op.amount.usd,
  txHash: op.txHash,
  explorer: op.explorer,
});
