import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Context } from "../context.js";
import type { ActivityEvent } from "../db.js";
import { accountIdSchema, explorerTx, sha256Hex, type TxHash } from "../near.js";
import type { AppRecord } from "../store.js";

export { accountIdSchema };

/** An app's id in the vault. */
export const appIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "must be an app id");

/** A claim link's ed25519 public key, "ed25519:<base58>". */
export const claimKeySchema = z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be an ed25519 public key");

export const refSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w.:-]+$/, "letters, digits and . _ : - only");

export const creditsSchema = z.union([z.string(), z.number()]);

/**
 * Onchain ref for an app's own ref. Namespaced by kind, so an app can reuse "job-42" for the
 * hold and the refund of the same job without colliding in the contract's ref space.
 */
export function onchainRef(kind: string, ref: string): string {
  return sha256Hex(`${kind}:${ref}`);
}

export function newRef(): string {
  return randomUUID();
}

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Newest first, then capped. `limit` comes from the query string. */
export function activityFor(ctx: Context, match: (e: ActivityEvent) => boolean, limitParam: unknown) {
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 500);
  const rows: ActivityEvent[] = [];
  const events = ctx.db.data.events;
  for (let i = events.length - 1; i >= 0 && rows.length < limit; i--) if (match(events[i])) rows.push(events[i]);
  return rows.map(ctx.indexer.present);
}

export const involves = (account: string) => (e: ActivityEvent) =>
  same(e.user, account) || same(e.from, account) || same(e.to, account);

export const forApp = (app: string) => (e: ActivityEvent) => same(e.app, app);

export function txInfo(ctx: Context, hash: TxHash) {
  return { txHash: hash, explorer: explorerTx(ctx.config.explorerUrl, hash) };
}

/** What users see about an app: its own profile, falling back to its company's. */
export function appProfile(ctx: Context, app: AppRecord) {
  const company = ctx.store.companyById(app.companyId);
  return {
    description: app.description ?? null,
    logoUrl: app.logoUrl ?? company?.logoUrl ?? null,
    website: app.website ?? company?.website ?? null,
    category: app.category ?? company?.category ?? null,
    company: company ? { name: company.name, website: company.website ?? null, supportEmail: company.supportEmail ?? null } : null,
  };
}
