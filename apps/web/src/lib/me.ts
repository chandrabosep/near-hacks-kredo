"use client";

import { useIdentityToken, usePrivy, useUser } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { useApi } from "./api";
import type { Amount } from "./format";

export type Connection = { app: string; name: string; connected: boolean; limit: Amount; expiresAt: string | null };
export type MyClaim = { claimKey: string; amount: Amount; status: "open" | "claimed" | "cancelled"; expiresAt: string };

export type Me = {
  address: string;
  email: string | null;
  balance: Amount;
  /** Test USDT in the user's own wallet, ready to turn into credits. */
  walletUsdt: Amount;
  connections: Connection[];
  claims: MyClaim[];
};

/**
 * The signed-in user, from our API. `status` is "signed-out" until Privy has a session and an
 * identity token, so pages can show the sign-in step first.
 */
export function useMe() {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { refreshUser } = useUser();
  const api = useApi();
  const [me, setMe] = useState<Me>();
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState(false);

  const refresh = useCallback(async () => {
    if (!identityToken) return;
    try {
      setMe(await api<Me>("GET", "/v1/me"));
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [api, identityToken]);

  // Privy can restore a session without an identity token. Ask for one, and say so if it never comes.
  useEffect(() => {
    if (!ready || !authenticated || identityToken) return;
    let live = true;
    refreshUser().then(
      () => live && setTimeout(() => live && setExpired(true), 5000),
      () => live && setExpired(true),
    );
    return () => {
      live = false;
    };
  }, [ready, authenticated, identityToken, refreshUser]);

  useEffect(() => {
    if (!identityToken) return;
    let live = true;
    api<Me>("GET", "/v1/me").then(
      (m) => live && (setMe(m), setError(undefined)),
      (err: Error) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, [api, identityToken]);

  const status: "loading" | "signed-out" | "ready" | "error" =
    !ready ? "loading" : !authenticated ? "signed-out" : me ? "ready" : error || (expired && !identityToken) ? "error" : "loading";

  return { me, status, error, expired: expired && !identityToken, refresh };
}
