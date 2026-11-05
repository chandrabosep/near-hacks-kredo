"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { chain, env } from "@/lib/env";

/**
 * Privy login for our hosted pages: email code only, and a Privy embedded wallet created on
 * first login. Wallet pop-ups are off because every signature is explained on our own screen
 * first, in plain words, before the user confirms.
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
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: false,
        },
        defaultChain: chain,
        supportedChains: [chain],
        appearance: { theme: "light", accentColor: "#0066FF", showWalletLoginFirst: false },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
