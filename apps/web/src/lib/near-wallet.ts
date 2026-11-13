import type { User } from "@privy-io/react-auth";

type WalletLike = { type: string; chainType?: string; walletClientType?: string; address?: string };

/** The user's Privy embedded NEAR wallet: its address is their implicit NEAR account. */
export function nearWalletOf(user: User | null | undefined): string | undefined {
  for (const a of (user?.linkedAccounts ?? []) as WalletLike[]) {
    if (a.type === "wallet" && a.chainType === "near" && a.walletClientType === "privy" && a.address) return a.address;
  }
  return undefined;
}

export const hasNearWallet = (user: User | null | undefined) => nearWalletOf(user) !== undefined;
