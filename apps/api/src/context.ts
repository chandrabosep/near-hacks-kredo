/** Wires config, chain clients, storage and the relayer together. Built once at boot. */
import { getContract } from "viem";
import { creditVaultAbi } from "./abi/CreditVault.js";
import { mockUSDTAbi } from "./abi/MockUSDT.js";
import { privyVerifier, type UserVerifier } from "./auth.js";
import { createClients } from "./chain.js";
import { loadConfig, type Config } from "./config.js";
import { bindToGenesis, dbFileFor, openDb } from "./db.js";
import { createIndexer } from "./indexer.js";
import { createRelayer } from "./relayer.js";
import { createStore } from "./store.js";

/** The ABI subset of USDT we use (ERC-20, permit, EIP-3009) is the same on the mock and the real token. */
export const usdtAbi = mockUSDTAbi;

export async function createContext(config: Config = loadConfig(), opts: { verifier?: UserVerifier } = {}) {
  const clients = createClients(config);
  const db = openDb(dbFileFor(config.dataDir, config.chainId, config.vault));

  const genesis = await clients.publicClient.getBlock({ blockNumber: 0n });
  if (bindToGenesis(db, genesis.hash)) {
    console.warn(`[db] ${db.file} belonged to an earlier chain; started clean`);
  }

  const vault = getContract({ address: config.vault, abi: creditVaultAbi, client: clients.publicClient });
  const usdt = getContract({ address: config.usdt, abi: usdtAbi, client: clients.publicClient });
  // Needed for the permit domain: TetherTokenV2 signs with its name() and version "1".
  const usdtName = await usdt.read.name();
  const verifier =
    opts.verifier ?? (config.privy ? privyVerifier(config.privy.appId, config.privy.appSecret) : undefined);

  const store = createStore(db);
  const relayer = createRelayer({ clients, db, txTimeoutMs: config.txTimeoutMs, limits: config.relayerLimits });
  const indexer = createIndexer({ config, publicClient: clients.publicClient, chain: clients.chain, db, store, relayer });

  return {
    config,
    ...clients,
    db,
    store,
    relayer,
    indexer,
    vault,
    usdt,
    usdtName,
    verifier,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
