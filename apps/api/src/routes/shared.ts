import { randomUUID } from "node:crypto";
import {
  getAddress,
  isAddress,
  keccak256,
  parseEventLogs,
  stringToHex,
  type ContractEventName,
  type GetEventArgs,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { z } from "zod";
import { creditVaultAbi } from "../abi/CreditVault.js";
import { explorerTx } from "../chain.js";
import type { Context } from "../context.js";
import type { AppRecord } from "../store.js";
import type { ActivityEvent } from "../db.js";

export const addressSchema = z
  .string()
  .refine((v) => isAddress(v), "must be an address")
  .transform((v) => getAddress(v));

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
export function onchainRef(kind: string, ref: string): Hex {
  return keccak256(stringToHex(`${kind}:${ref}`));
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

export const involves = (address: string) => (e: ActivityEvent) =>
  same(e.user, address) || same(e.from, address) || same(e.to, address);

export const forApp = (app: string) => (e: ActivityEvent) => same(e.app, app);

export function txInfo(ctx: Context, hash: Hex) {
  return { txHash: hash, explorer: explorerTx(ctx.chain, hash) };
}

type VaultAbi = typeof creditVaultAbi;

/** The first vault event of a kind in a receipt. */
export function vaultEvent<E extends ContractEventName<VaultAbi>>(
  receipt: TransactionReceipt,
  eventName: E,
): GetEventArgs<VaultAbi, E, { EnableUnion: false; IndexedOnly: false; Required: true }> {
  const [log] = parseEventLogs({ abi: creditVaultAbi, logs: receipt.logs, eventName: eventName as ContractEventName<VaultAbi> });
  if (!log) throw new Error(`no ${eventName} event in ${receipt.transactionHash}`);
  return log.args as never;
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
