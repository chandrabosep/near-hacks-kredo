/** Public config, inlined at build time. */
export const env = {
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, ""),
  /** NEAR network the vault runs on. */
  network: process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet",
  explorerUrl: (process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.nearblocks.io").replace(/\/$/, ""),
};

/** A NEAR account on the block explorer. */
export const explorerAccount = (account: string) => `${env.explorerUrl}/address/${account}`;
