/** Express plumbing: errors, auth, rate limits and CORS. */
import { timingSafeEqual } from "node:crypto";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { AuthError, type UserVerifier, type VerifiedUser } from "./auth.js";
import { PricingError } from "./pricing.js";
import { RelayerError } from "./relayer.js";
import type { AppRecord, Store, UserRecord } from "./store.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
  ) {
    super(message);
  }
}

/** Plain-language messages for the contract's errors. The code is always the contract's name. */
const CONTRACT_ERRORS: Record<string, string> = {
  OverLimit: "The user hasn't approved this app for that much. Ask them to raise the app's limit.",
  LimitExpired: "The user's approval for this app has expired.",
  InsufficientBalance: "The user doesn't have enough credits.",
  OverMaxCharge: "Above this app's largest allowed single charge.",
  AppInactive: "This app is switched off.",
  UnknownApp: "This app isn't registered on the vault.",
  RefUsed: "That ref was already used for this app.",
  HoldNotOpen: "This hold is already captured or released.",
  HoldExpired: "This hold has expired. Release it and start a new one.",
  HoldNotExpired: "This hold hasn't expired yet.",
  OverHeld: "Can't capture more than was held.",
  OverSpent: "Can't refund more than the user spent with this app.",
  InsufficientEarnings: "Not enough unpaid earnings to cover this refund.",
  BadSignature: "The signature doesn't match. Sign again.",
  SignatureExpired: "The signature expired. Sign again.",
  NonceUsed: "That signature was already used.",
  ClaimNotOpen: "This link was already claimed or cancelled.",
  ClaimExpired: "This link has expired.",
  ClaimExists: "That claim link already exists.",
  EnforcedPause: "The network is paused for maintenance. Try again shortly.",
  ZeroAmount: "Nothing to do: the amount is zero.",
};

/** The relayer's own limits. Nothing was sent, so nothing was spent. */
const RELAYER_LIMITS: Record<string, string> = {
  GasTooHigh: "This transaction needs more gas than the network allows.",
  GasPriceTooHigh: "Gas prices are unusually high right now. Try again shortly.",
  DailyBudgetReached: "The network has hit its daily gas budget. Try again later.",
  AppBudgetReached: "This app has hit its daily gas budget. Try again later.",
  RelayerLowBalance: "The network is low on gas. Only releases, revokes and payouts go through right now.",
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
    return void res.status(400).json({ error: issues.join("; "), code: "invalid_request", issues });
  }
  if (err instanceof PricingError) return void res.status(400).json({ error: err.message, code: "pricing" });
  if (err instanceof AuthError) return void res.status(401).json({ error: err.message, code: "unauthenticated" });
  if (err instanceof RelayerError && RELAYER_LIMITS[err.reason]) {
    return void res.status(503).json({ error: RELAYER_LIMITS[err.reason], code: err.reason });
  }
  if (err instanceof RelayerError) {
    const message = CONTRACT_ERRORS[err.reason];
    return void res.status(message ? 422 : 502).json({
      error: message ?? `Transaction failed: ${err.reason}`,
      code: message ? err.reason : "relayer",
      txHash: err.hash,
    });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return void res.status(400).json({ error: "Body is not valid JSON", code: "invalid_json" });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side", code: "internal" });
};

// ---------------------------------------------------------------- locals

export function appOf(res: Response): AppRecord {
  return res.locals.app as AppRecord;
}

export function userOf(res: Response): VerifiedUser & { record: UserRecord } {
  return res.locals.user as VerifiedUser & { record: UserRecord };
}

// ---------------------------------------------------------------- auth

/** Company server calls: `Authorization: Bearer uc_live_...`. */
export function requireApiKey(store: Store): RequestHandler {
  return (req, res, next) => {
    const key = bearer(req);
    const app = key ? store.appByApiKey(key) : undefined;
    if (!app) return next(new HttpError(401, "Missing or unknown API key", "unauthenticated"));
    res.locals.app = app;
    next();
  };
}

/** Our hosted pages: the Privy identity token, as the `privy-id-token` cookie or header. */
export function requireUser(verifier: UserVerifier | undefined, store: Store): RequestHandler {
  return async (req, res, next) => {
    if (!verifier) return next(new HttpError(503, "User login isn't configured on this server", "login_disabled"));
    const token = req.header("privy-id-token") ?? cookie(req, "privy-id-token");
    if (!token) return next(new HttpError(401, "Sign in first", "unauthenticated"));
    try {
      const user = await verifier(token);
      res.locals.user = { ...user, record: store.upsertUser(user) };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAdmin(token: string | undefined): RequestHandler {
  return (req, _res, next) => {
    if (!token) return next(new HttpError(404, "Not found", "not_found"));
    const given = bearer(req);
    if (!given || !safeEqual(given, token)) return next(new HttpError(401, "Bad admin token", "unauthenticated"));
    next();
  };
}

// ---------------------------------------------------------------- rate limit

/**
 * Write budget per API key. The contract already caps every charge by the user's signed limit;
 * this stops a leaked key from burning relayer gas on thousands of calls.
 */
export function rateLimit(perMinute: number): RequestHandler {
  const windows = new Map<string, number[]>();
  return (req, res, next) => {
    if (req.method === "GET") return next();
    const key = appOf(res)?.id ?? req.ip ?? "anon";
    const now = Date.now();
    const hits = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= perMinute) {
      const retryAfter = Math.ceil((60_000 - (now - hits[0])) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      windows.set(key, hits);
      return next(new HttpError(429, `Too many requests. Retry in ${retryAfter}s.`, "rate_limited"));
    }
    hits.push(now);
    windows.set(key, hits);
    next();
  };
}

// ---------------------------------------------------------------- cors

/** Only our hosted pages may call the API from a browser, with credentials. */
export function cors(origins: string[]): RequestHandler {
  const allowed = new Set(origins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,privy-id-token");
    }
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  };
}

// ---------------------------------------------------------------- helpers

function bearer(req: Request): string | undefined {
  const h = req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
}

function cookie(req: Request, name: string): string | undefined {
  for (const part of (req.header("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
