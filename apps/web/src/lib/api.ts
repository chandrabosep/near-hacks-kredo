"use client";

import { useIdentityToken, useSignTypedData, type SignTypedDataParams } from "@privy-io/react-auth";
import { useCallback } from "react";
import { env } from "./env";

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

type SignResponse = { summary?: string; request: SignTypedDataParams & { message: Record<string, string> } };

/**
 * One user action, the way every hosted page does it:
 *   1. ask the API for the EIP-712 message, with a fresh nonce and deadline
 *   2. sign it with the user's Privy wallet, in the browser
 *   3. hand the message and signature back; the relayer submits it and pays the gas
 */
export function useAction() {
  const api = useApi();
  const { signTypedData } = useSignTypedData();

  /** Step 1 only, so the page can show the summary before the user confirms. */
  const prepare = useCallback((action: Action, input: Record<string, unknown>) => {
    return api<SignResponse>("POST", `/v1/me/sign/${action}`, input);
  }, [api]);

  /** Steps 2 and 3, after the user confirms. */
  const confirm = useCallback(
    async <T = unknown>(action: Action, prepared: SignResponse): Promise<T> => {
      const { signature } = await signTypedData(prepared.request);
      return api<T>("POST", `/v1/me/submit/${action}`, { message: prepared.request.message, signature });
    },
    [api, signTypedData],
  );

  return { prepare, confirm };
}
