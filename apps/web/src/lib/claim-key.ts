/**
 * Claim link keys. A link carries a fresh ed25519 secret in its #fragment, which browsers never
 * send to a server. The vault stores only the public key, as "ed25519:<base58>", and the secret
 * signs who the credits go to when the link is redeemed.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

export const isClaimSecret = (v: string | null): v is string => !!v && /^[0-9a-f]{64}$/.test(v);

/** A new link key: the secret goes in the link, the public key to the vault. */
export function newClaimKey(): { secret: string; publicKey: string } {
  const secret = toHex(ed25519.utils.randomPrivateKey());
  return { secret, publicKey: claimPublicKey(secret) };
}

export function claimPublicKey(secret: string): string {
  return `ed25519:${base58.encode(ed25519.getPublicKey(fromHex(secret)))}`;
}

/** Signs the vault's claim message for the recipient, as hex. */
export function signClaim(secret: string, message: string): string {
  return toHex(ed25519.sign(new TextEncoder().encode(message), fromHex(secret)));
}
