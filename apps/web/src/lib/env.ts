import { anvil, whitechainSepolia } from "viem/chains";

/** Public config, inlined at build time. */
export const env = {
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, ""),
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? whitechainSepolia.id),
};

/** Users only sign EIP-712 messages; the relayer sends every transaction and pays the gas. */
export const chain = env.chainId === anvil.id ? anvil : whitechainSepolia;
