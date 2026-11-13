/**
 * User actions as NEAR meta transactions (NEP-366).
 *
 *   1. prepare: the API builds a delegate action for the user's own account (calls on the vault
 *      or the USDT token only), with the next nonce on their key and a short block-height expiry.
 *      The browser gets its hash.
 *   2. The user's Privy NEAR wallet signs that hash (ed25519), in the browser.
 *   3. submit: the API checks the signature against the user's key, wraps the signed delegate in
 *      a transaction from the relayer, and sends it. The relayer pays the gas; the contract sees
 *      the user as the caller.
 *
 * The relayer can't change a signed delegate action, and only actions this API prepared, for the
 * signed-in user, are ever relayed.
 */
import { createHash } from "node:crypto";
import { actions as nearActions, buildDelegateAction, encodeDelegateAction, KeyType, PublicKey, Signature, type DelegateAction } from "near-api-js";
import { TGAS, toPublicKey, type AccountId, type Chain } from "./near.js";

/** Blocks a prepared action stays valid for: roughly ten minutes. */
const TTL_BLOCKS = 600;
const TTL_MS = 10 * 60_000;

export type Prepared = { hash: string; delegate: DelegateAction; expires: number; meta: Record<string, unknown> };

export type UserCall = { receiver: AccountId; method: string; args: Record<string, unknown>; gas?: bigint; deposit?: bigint };

export class MetaError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export function delegateHash(delegate: DelegateAction): Uint8Array {
  return new Uint8Array(createHash("sha256").update(encodeDelegateAction(delegate)).digest());
}

export function createMeta(opts: { chain: Chain; allowed: AccountId[]; now?: () => number }) {
  const { chain, allowed } = opts;
  const now = opts.now ?? Date.now;
  const pending = new Map<string, Prepared & { user: AccountId; publicKey: string; nonce: bigint }>();

  function sweep() {
    const t = now();
    for (const [k, p] of pending) if (p.expires <= t) pending.delete(k);
  }

  /** The next nonce, above the chain's and above anything already prepared for this key. */
  function nextNonce(user: AccountId, publicKey: string, onchain: bigint): bigint {
    let n = onchain;
    for (const p of pending.values()) if (p.user === user && p.publicKey === publicKey && p.nonce > n) n = p.nonce;
    return n + 1n;
  }

  return {
    /** Builds one action for `user` and keeps it until they sign or it expires. */
    async prepare(user: AccountId, publicKey: string, c: UserCall, meta: Record<string, unknown> = {}): Promise<{ hash: string; delegate: string; expiresAt: string }> {
      if (!allowed.includes(c.receiver)) throw new MetaError(400, "Not a Kredo contract", "bad_receiver");
      sweep();
      const key = toPublicKey(publicKey);
      const [onchain, head] = await Promise.all([chain.accessKeyNonce(user, key), chain.head()]);
      if (onchain === undefined) throw new MetaError(409, "Your NEAR account isn't set up yet. Try again in a moment.", "account_not_ready");
      const nonce = nextNonce(user, key.toString(), onchain);
      const delegate = buildDelegateAction({
        senderId: user,
        receiverId: c.receiver,
        actions: [nearActions.functionCall(c.method, c.args, c.gas ?? 50n * TGAS, c.deposit ?? 0n)],
        nonce,
        maxBlockHeight: BigInt(head.height + TTL_BLOCKS),
        publicKey: key,
      });
      const hash = Buffer.from(delegateHash(delegate)).toString("hex");
      const expires = now() + TTL_MS;
      pending.set(hash, { hash, delegate, expires, meta: { ...meta, method: c.method }, user, publicKey: key.toString(), nonce });
      // The exact bytes behind the hash, so the signer can check what it signs instead of trusting us.
      const bytes = Buffer.from(encodeDelegateAction(delegate)).toString("base64");
      return { hash: `0x${hash}`, delegate: bytes, expiresAt: new Date(expires).toISOString() };
    },

    /**
     * Takes a prepared action back with the user's signature. Checks the action is theirs and
     * the signature is from their key. The caller relays it.
     */
    take(user: AccountId, hashHex: string, signatureHex: string): Prepared & { signature: Uint8Array } {
      sweep();
      const hash = hashHex.replace(/^0x/, "").toLowerCase();
      const p = pending.get(hash);
      if (!p || p.user !== user) throw new MetaError(404, "That request expired or isn't yours. Start again.", "not_found");
      const signature = Buffer.from(signatureHex.replace(/^0x/, ""), "hex");
      if (signature.length !== 64) throw new MetaError(400, "The signature must be 64 bytes", "bad_signature");
      const key = PublicKey.from(p.publicKey);
      if (!key.verify(Buffer.from(hash, "hex"), signature)) throw new MetaError(400, "The signature doesn't match. Sign again.", "BadSignature");
      pending.delete(hash);
      return { ...p, signature: new Uint8Array(signature) };
    },
  };
}

/** A signed delegate as near-api-js sends it, for tests and scripts. */
export function signedDelegateAction(delegate: DelegateAction, signature: Uint8Array) {
  return nearActions.signedDelegate({ delegateAction: delegate, signature: new Signature({ keyType: KeyType.ED25519, data: signature }) });
}

export type Meta = ReturnType<typeof createMeta>;
