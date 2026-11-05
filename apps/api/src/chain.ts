import {
  createPublicClient,
  createWalletClient,
  http,
  nonceManager,
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, whitechainSepolia } from "viem/chains";
import { WHITECHAIN_SEPOLIA, type Config } from "./config.js";

export type Clients = {
  chain: Chain;
  publicClient: PublicClient<Transport, Chain>;
  walletClient: WalletClient<Transport, Chain, Account>;
  operator: Account;
};

/** viem ships Whitechain Sepolia with OP Stack formatters, so receipts include the L1 data fee. */
export function chainFor(chainId: number): Chain {
  return chainId === WHITECHAIN_SEPOLIA ? whitechainSepolia : anvil;
}

export function createClients(config: Pick<Config, "chainId" | "rpcUrl" | "operatorKey">): Clients {
  const chain = chainFor(config.chainId);
  // Batch reads into one HTTP request: Whitechain's RPC limits requests, not calls.
  const transport = http(config.rpcUrl, { batch: true, retryCount: 3 });
  // Tracks the next nonce locally, so back-to-back transactions never reuse one.
  const operator = privateKeyToAccount(config.operatorKey, { nonceManager });
  return {
    chain,
    operator,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account: operator, chain, transport }),
  };
}

export function explorerTx(chain: Chain, hash: string): string | undefined {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function explorerAddress(chain: Chain, address: Address): string | undefined {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : undefined;
}
