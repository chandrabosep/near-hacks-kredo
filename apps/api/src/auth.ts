/**
 * User login through Privy. Our hosted pages log users in with an email code, and each request
 * carries Privy's identity token. We verify it with the Privy SDK and take the user's NEAR account
 * from their Privy embedded NEAR wallet, never from the request body.
 *
 * That wallet's ed25519 key controls an implicit NEAR account. Users sign every action with it in
 * the browser, as a NEP-366 delegate action. This server never holds a user key.
 */
import { PrivyClient, type User } from "@privy-io/node";
import { implicitAccountOf, isImplicitAccount, toPublicKey, type AccountId } from "./near.js";

export type VerifiedUser = {
  privyId: string;
  /** The implicit account of the user's Privy NEAR wallet. */
  address: AccountId;
  /** That wallet's public key, "ed25519:...". */
  publicKey: string;
  email?: string;
};

/** Turns a Privy identity token into a verified user, or throws AuthError. */
export type UserVerifier = (idToken: string) => Promise<VerifiedUser>;

export class AuthError extends Error {
  override name = "AuthError";
}

export function privyVerifier(appId: string, appSecret: string): UserVerifier {
  const client = new PrivyClient({ appId, appSecret });
  return async (idToken) => {
    let user: User;
    try {
      user = await client.users().get({ id_token: idToken });
    } catch {
      throw new AuthError("login expired or invalid, sign in again");
    }
    return fromPrivyUser(user);
  };
}

type LinkedAccount = { type: string; address?: string; chain_type?: string; wallet_client_type?: string; wallet_index?: number; public_key?: string };

/** Picks the user's first Privy embedded NEAR wallet and their email. */
export function fromPrivyUser(user: { id: string; linked_accounts: readonly unknown[] }): VerifiedUser {
  let wallet: { address: string; publicKey?: string; index: number } | undefined;
  let email: string | undefined;
  for (const raw of user.linked_accounts) {
    const a = raw as LinkedAccount;
    if (a.type === "email" && a.address) email = a.address.toLowerCase();
    if (a.type === "wallet" && a.wallet_client_type === "privy" && a.chain_type === "near" && a.address) {
      const index = typeof a.wallet_index === "number" ? a.wallet_index : 0;
      if (!wallet || index < wallet.index) wallet = { address: a.address, publicKey: a.public_key, index };
    }
  }
  if (!wallet) throw new AuthError("no NEAR wallet on this account yet");

  // An implicit account is its own public key in hex, so the key and the account must agree.
  // Privy may leave public_key empty for NEAR wallets; the implicit account then is the key.
  const key = parseKey(wallet.publicKey) ?? parseKey(wallet.address);
  if (!key) throw new AuthError("the NEAR wallet on this account has no usable public key");
  const account = implicitAccountOf(key);
  if (isImplicitAccount(wallet.address.toLowerCase()) && wallet.address.toLowerCase() !== account) {
    throw new AuthError("the NEAR wallet's key doesn't match its account");
  }
  return { privyId: user.id, address: account, publicKey: key.toString(), email };
}

/** An ed25519 key from hex, base58 or "ed25519:...", or undefined when it isn't one. */
function parseKey(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    return toPublicKey(value);
  } catch {
    return undefined;
  }
}
