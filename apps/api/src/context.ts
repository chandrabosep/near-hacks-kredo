/** Wires config, chain clients, storage and the relayer together. Built once at boot. */
import { getContract } from "viem";
import { creditVaultAbi } from "./abi/CreditVault.js";
import { mockUSDTAbi } from "./abi/MockUSDT.js";
import { createClients } from "./chain.js";
import { loadConfig, type Config } from "./config.js";
import { bindToGenesis, dbFileFor, openDb } from "./db.js";
import { createRelayer } from "./relayer.js";
import { createStore } from "./store.js";

/** The ABI subset of USDT we use (ERC-20, permit, EIP-3009) is the same on the mock and the real token. */
export const usdtAbi = mockUSDTAbi;

export async function createContext(config: Config = loadConfig()) {
  const clients = createClients(config);
  const db = openDb(dbFileFor(config.dataDir, config.chainId, config.vault));

  const genesis = await clients.publicClient.getBlock({ blockNumber: 0n });
  if (bindToGenesis(db, genesis.hash)) {
    console.warn(`[db] ${db.file} belonged to an earlier chain; started clean`);
  }

  const vault = getContract({ address: config.vault, abi: creditVaultAbi, client: clients.publicClient });
  const usdt = getContract({ address: config.usdt, abi: usdtAbi, client: clients.publicClient });

  return {
    config,
    ...clients,
    db,
    store: createStore(db),
    relayer: createRelayer({ clients, db, txTimeoutMs: config.txTimeoutMs }),
    vault,
    usdt,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
