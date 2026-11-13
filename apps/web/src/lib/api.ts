"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useCallback } from "react";
import { env } from "./env";
import { nearWalletOf } from "./near-wallet";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Calls our API as the logged-in user, with Privy's identity token. */
export function useApi() {
  const { identityToken } = useIdentityToken();

  return useCallback(
    async <T = unknown>(method: string, path: string, body?: unknown): Promise<T> => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (identityToken) headers["privy-id-token"] = identityToken;
      const res = await fetch(`${env.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data.code ?? "error", data.error ?? `Request failed (${res.status})`);
      return data as T;
    },
    [identityToken],
  );
}

export type Action = "buy" | "connect" | "disconnect" | "send" | "claim";

type SignResponse = { summary?: string; request: { account: string; hash: `0x${string}`; expiresAt: string } };

/**
 * One user action, the way every hosted page does it:
 *   1. ask the API for the action as a NEAR delegate action (NEP-366), and get back its hash
 *   2. sign that hash with the user's Privy NEAR wallet, in the browser
 *   3. hand the hash and signature back; the relayer wraps it in a transaction and pays the gas
 */
export function useAction() {
  const api = useApi();
  const { signRawHash } = useSignRawHash();
  const { user } = usePrivy();

  /** Step 1 only, so the page can show the summary before the user confirms. */
  const prepare = useCallback((action: Action, input: Record<string, unknown>) => {
    return api<SignResponse>("POST", `/v1/me/sign/${action}`, input);
  }, [api]);

  /** Steps 2 and 3, after the user confirms. */
  const confirm = useCallback(
    async <T = unknown>(action: Action, prepared: SignResponse): Promise<T> => {
      const { hash, account } = prepared.request;
      // Sign with the wallet as Privy names it; the API derives the same account from its key.
      const { signature } = await signRawHash({ address: nearWalletOf(user) ?? account, chainType: "near", hash });
      return api<T>("POST", `/v1/me/submit/${action}`, { hash, signature });
    },
    [api, signRawHash, user],
  );

  return { prepare, confirm };
}
