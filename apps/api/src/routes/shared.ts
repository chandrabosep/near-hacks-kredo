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
