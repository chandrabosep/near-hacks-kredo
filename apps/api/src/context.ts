/** Wires config, the NEAR chain, storage and the relayer together. Built once at boot. */
import { privyVerifier, type UserVerifier } from "./auth.js";
import { loadConfig, type Config } from "./config.js";
import { bindToVault, openDb, pgDirFor } from "./db.js";
import { createCodes } from "./codes.js";
import { createIndexer } from "./indexer.js";
import { createMeta } from "./meta.js";
import { createNearChain, type Chain } from "./near.js";
import { createRelayer } from "./relayer.js";
import { createStore } from "./store.js";
import { createVault } from "./vault.js";

export async function createContext(
  config: Config = loadConfig(),
  opts: { verifier?: UserVerifier; memoryDb?: boolean; chain?: Chain } = {},
) {
  const chain =
    opts.chain ?? createNearChain({ network: config.network, rpcUrl: config.rpcUrl, relayerId: config.relayerId, relayerKey: config.relayerKey });
  const db = await openDb({
    url: config.databaseUrl,
    dir: opts.memoryDb ? undefined : pgDirFor(config.dataDir, config.network, config.vault),
  });
  if (await bindToVault(db, `${config.network}:${config.vault}`)) {
    console.warn(`[db] ${db.where} belonged to another network or vault; started clean`);
  }

  const vault = createVault(chain, config.vault, config.usdt);
  const verifier =
    opts.verifier ?? (config.privy ? privyVerifier(config.privy.appId, config.privy.appSecret) : undefined);

  const store = createStore(db);
  const relayer = createRelayer({ chain, db, vault: config.vault, limits: config.relayerLimits });
  const indexer = createIndexer({ config, chain, vault, db, store, relayer });
  const meta = createMeta({ chain, allowed: [config.vault, config.usdt] });

  return {
    config,
    chain,
    db,
    store,
    relayer,
    indexer,
    meta,
    codes: createCodes(),
    vault,
    verifier,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
