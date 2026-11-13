"use client";

import { PrivyProvider, usePrivy, useUser } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import { useEffect, useRef, type ReactNode } from "react";
import { env } from "@/lib/env";
import { hasNearWallet } from "@/lib/near-wallet";

/**
 * Privy login for our hosted pages: email code only. Each user gets a Privy embedded NEAR wallet
 * on first login: an ed25519 key only they can use, whose implicit account holds their Kredo
 * balance. Wallet pop-ups are off because every signature is explained on our own screen first,
 * in plain words, before the user confirms.
 */
export function Providers({ children }: { children: ReactNode }) {
  if (!env.privyAppId) {
    return (
      <>
        <p role="alert" className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Login is off: set NEXT_PUBLIC_PRIVY_APP_ID in apps/web/.env.local.
        </p>
        {children}
      </>
    );
  }
  return (
    <PrivyProvider
      appId={env.privyAppId}
      config={{
        loginMethods: ["email"],
        embeddedWallets: { showWalletUIs: false },
        appearance: { theme: "light", accentColor: "#0066FF", showWalletLoginFirst: false, landingHeader: "Sign in to Kredo" },
      }}
    >
      <NearWallet />
      {children}
    </PrivyProvider>
  );
}

/** Creates the user's NEAR wallet the first time they sign in, then refreshes their identity token. */
function NearWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { refreshUser } = useUser();
  const started = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || !user || hasNearWallet(user) || started.current) return;
    started.current = true;
    createWallet({ chainType: "near" })
      .then(() => refreshUser())
      .catch((err: Error) => console.warn(`[privy] could not create a NEAR wallet: ${err.message}`))
      .finally(() => {
        started.current = false;
      });
  }, [ready, authenticated, user, createWallet, refreshUser]);

  return null;
}
