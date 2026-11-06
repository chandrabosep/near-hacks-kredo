/**
 * Everything Parley needs from Kredo, on the server. The API key never leaves this file.
 */
import { Credits, CreditsError } from "kredo";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/** Parley's price list, in credits. 1 credit = $0.01. */
export const PRICES = {
  "chat.pro": { price: 4 },
  "chat.fast": { price: 1 },
} as const;

export type PriceAction = keyof typeof PRICES;

let client: Credits | undefined;
let priced: Promise<unknown> | undefined;

/** The Kredo client, with Parley's prices set once per server start. */
export async function kredo(): Promise<Credits> {
  if (!process.env.CREDITS_API_KEY) {
    throw new CreditsError("Parley isn't set up yet: add CREDITS_API_KEY to .env.local", 503, "not_configured");
  }
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

// ---------------------------------------------------------------- Parley's own sessions

/**
 * A real app links the Kredo user to its own account system. Parley has no accounts, so each
 * browser gets an id cookie, and the Kredo address and email it connected are kept in a small file.
 */
const COOKIE = "parley_sid";
const FILE = ".data/sessions.json";

/** Older entries hold just the address. */
type Linked = string | { address: string; email: string | null };

function readAll(): Record<string, Linked> {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Linked>) {
  mkdirSync(".data", { recursive: true });
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}

async function visitor(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id) {
    id = randomUUID();
    jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return id;
}

async function linked(): Promise<{ address: string; email: string | null } | undefined> {
  const entry = readAll()[await visitor()];
  return typeof entry === "string" ? { address: entry, email: null } : entry;
}

/** The Kredo address this browser connected, if any. Never taken from the request body. */
export async function currentUser(): Promise<string | undefined> {
  return (await linked())?.address;
}

/** The email the user shared when they connected Parley, if any. */
export async function currentEmail(): Promise<string | null> {
  return (await linked())?.email ?? null;
}

export async function linkUser(address: string, email: string | null) {
  const all = readAll();
  all[await visitor()] = { address, email };
  writeAll(all);
}

export async function unlinkUser() {
  const all = readAll();
  delete all[await visitor()];
  writeAll(all);
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
