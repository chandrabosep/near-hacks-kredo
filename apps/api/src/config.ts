import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

export const WHITECHAIN_SEPOLIA = 1874;
export const LOCAL_CHAIN = 31337;

/** Anvil's first default account. Accepted only on the local chain. */
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEPLOYMENTS_DIR = resolve(here, "../../../contracts/deployments");

const address = z.string().refine((v) => isAddress(v), "must be an address").transform((v) => getAddress(v));
const privateKey = z.string().refine((v) => isHex(v) && v.length === 66, "must be a 32-byte hex key");

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CHAIN_ID: z.coerce.number().int().refine((v) => v === WHITECHAIN_SEPOLIA || v === LOCAL_CHAIN, {
    message: `must be ${WHITECHAIN_SEPOLIA} (Whitechain Sepolia) or ${LOCAL_CHAIN} (local)`,
  }).default(LOCAL_CHAIN),
  RPC_URL: z.url().optional(),
  OPERATOR_KEY: privateKey.optional(),
  VAULT_ADDRESS: address.optional(),
  USDT_ADDRESS: address.optional(),
  START_BLOCK: z.coerce.number().int().nonnegative().optional(),
  DEPLOYMENTS_DIR: z.string().default(DEFAULT_DEPLOYMENTS_DIR),
  DATA_DIR: z.string().default("./data"),
  /** How long the relayer waits for a receipt before giving up on a transaction. */
  TX_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Privy app credentials. Without them, user routes answer 503. */
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(),
  /** Origins of our hosted pages, comma separated. They may call user routes with cookies. */
  WEB_ORIGINS: z.string().default("http://localhost:3000"),
  /** Guards /v1/admin. Without it, admin routes are off (except locally, where it defaults to "dev-admin"). */
  ADMIN_TOKEN: z.string().min(8).optional(),
  /** Network fee for new apps, in basis points. 500 = 5%. */
  NETWORK_FEE_BPS: z.coerce.number().int().min(0).max(2_000).default(500),
  /** Write requests per minute per API key. */
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  /** Default and longest hold, in seconds. The contract caps holds at one day. */
  HOLD_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
});

const deploymentSchema = z.object({
  chainId: z.number(),
  creditVault: address,
  usdt: address,
  deployBlock: z.number().int().nonnegative(),
});

export type Config = {
  port: number;
  chainId: number;
  rpcUrl: string;
  operatorKey: Hex;
  vault: Address;
  usdt: Address;
  startBlock: number;
  dataDir: string;
  txTimeoutMs: number;
  privy?: { appId: string; appSecret: string };
  webOrigins: string[];
  adminToken?: string;
  networkFeeBps: number;
  rateLimitPerMin: number;
  holdTtlSeconds: number;
};

/**
 * Reads config from the environment. Contract addresses come from the deploy script's
 * deployments/<chainId>.json unless VAULT_ADDRESS and USDT_ADDRESS are set.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const e = parsed.data;
  const local = e.CHAIN_ID === LOCAL_CHAIN;

  if (!e.OPERATOR_KEY && !local) throw new Error("OPERATOR_KEY is required on Whitechain Sepolia");
  if (e.OPERATOR_KEY === ANVIL_KEY && !local) throw new Error("The anvil test key must never be used on Whitechain");

  let vault = e.VAULT_ADDRESS;
  let usdt = e.USDT_ADDRESS;
  let startBlock = e.START_BLOCK;
  if (!vault || !usdt) {
    const file = resolve(e.DEPLOYMENTS_DIR, `${e.CHAIN_ID}.json`);
    if (!existsSync(file)) {
      throw new Error(`No deployment found at ${file}. Run the deploy script, or set VAULT_ADDRESS and USDT_ADDRESS.`);
    }
    const d = deploymentSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    if (d.chainId !== e.CHAIN_ID) throw new Error(`${file} is for chain ${d.chainId}, not ${e.CHAIN_ID}`);
    vault ??= d.creditVault;
    usdt ??= d.usdt;
    startBlock ??= d.deployBlock;
  }

  if ((e.PRIVY_APP_ID === undefined) !== (e.PRIVY_APP_SECRET === undefined)) {
    throw new Error("Set both PRIVY_APP_ID and PRIVY_APP_SECRET, or neither");
  }

  return {
    port: e.PORT,
    chainId: e.CHAIN_ID,
    rpcUrl: e.RPC_URL ?? (local ? "http://127.0.0.1:8545" : "https://rpc.testnet.whitechain.io"),
    operatorKey: (e.OPERATOR_KEY ?? ANVIL_KEY) as Hex,
    vault,
    usdt,
    startBlock: startBlock ?? 0,
    dataDir: e.DATA_DIR,
    txTimeoutMs: e.TX_TIMEOUT_MS,
    privy: e.PRIVY_APP_ID && e.PRIVY_APP_SECRET ? { appId: e.PRIVY_APP_ID, appSecret: e.PRIVY_APP_SECRET } : undefined,
    webOrigins: e.WEB_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    adminToken: e.ADMIN_TOKEN ?? (local ? "dev-admin" : undefined),
    networkFeeBps: e.NETWORK_FEE_BPS,
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    holdTtlSeconds: e.HOLD_TTL_SECONDS,
  };
}
