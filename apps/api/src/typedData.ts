/**
 * EIP-712 messages users sign with their Privy wallet. The backend builds each one with a fresh
 * nonce and deadline, the browser signs it, and the relayer submits it. The contract checks the
 * signature, so the relayer can't change any field.
 *
 * uint values are sent as decimal strings, since JSON has no bigint.
 */
import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";

export const vaultTypes = {
  ApproveApp: [
    { name: "user", type: "address" },
    { name: "app", type: "address" },
    { name: "limit", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
  RevokeApp: [
    { name: "user", type: "address" },
    { name: "app", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
  Send: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
  CreateClaim: [
    { name: "from", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "claimKey", type: "address" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
  RedeemClaim: [
    { name: "claimKey", type: "address" },
    { name: "to", type: "address" },
  ],
} as const;

/** EIP-2612 permit, as TetherTokenV2 and our mock define it. */
export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type Domain = { name: string; version: string; chainId: number; verifyingContract: Address };

export function vaultDomain(chainId: number, vault: Address): Domain {
  return { name: "CreditVault", version: "1", chainId, verifyingContract: vault };
}

/** TetherTokenV2's domain: its name() and version "1". */
export function usdtDomain(chainId: number, usdt: Address, name: string): Domain {
  return { name, version: "1", chainId, verifyingContract: usdt };
}

export type SignRequest<P extends string> = {
  domain: Domain;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: P;
  message: Record<string, string>;
};

export function signRequest<P extends keyof typeof vaultTypes>(
  domain: Domain,
  primaryType: P,
  message: Record<string, string>,
): SignRequest<P> {
  return { domain, types: { [primaryType]: vaultTypes[primaryType] }, primaryType, message };
}

export function newNonce(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

/** Unix seconds, `secondsFromNow` ahead. Signed messages are short-lived. */
export function deadlineIn(secondsFromNow = 15 * 60): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}
