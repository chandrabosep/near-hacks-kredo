/**
 * User login through Privy. Our hosted pages log users in with an email code, and each request
 * carries Privy's identity token. We verify it with the Privy SDK and take the user's address
 * from their Privy embedded wallet, never from the request body.
 *
 * Users sign every action with that wallet in the browser. This server never holds a user key.
 */
import { PrivyClient, type User } from "@privy-io/node";
import { getAddress, type Address } from "viem";

export type VerifiedUser = { privyId: string; address: Address; email?: string };

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

/** Picks the user's first Privy embedded Ethereum wallet and their email. */
export function fromPrivyUser(user: Pick<User, "id" | "linked_accounts">): VerifiedUser {
  let wallet: { address: string; wallet_index: number } | undefined;
  let email: string | undefined;
  for (const a of user.linked_accounts) {
    if (a.type === "email") email = a.address.toLowerCase();
    if (
      a.type === "wallet" &&
      "wallet_client_type" in a &&
      a.wallet_client_type === "privy" &&
      "chain_type" in a &&
      a.chain_type === "ethereum"
    ) {
      const index = "wallet_index" in a && typeof a.wallet_index === "number" ? a.wallet_index : 0;
      if (!wallet || index < wallet.wallet_index) wallet = { address: a.address, wallet_index: index };
    }
  }
  if (!wallet) throw new AuthError("no Privy wallet on this account yet");
  return { privyId: user.id, address: getAddress(wallet.address), email };
}
