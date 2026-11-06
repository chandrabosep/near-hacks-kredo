import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, isHex, parseEther, parseGwei, parseUnits, type Address, type Hex } from "viem";
import { z } from "zod";
import type { RelayerLimits } from "./relayer.js";
import { creditsToUnits } from "./units.js";

export const WHITECHAIN_SEPOLIA = 1874;
export const LOCAL_CHAIN = 31337;

/** Anvil's first default account. Accepted only on the local chain. */
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEPLOYMENTS_DIR = resolve(here, "../../../contracts/deployments");

const address = z.string().refine((v) => isAddress(v), "must be an address").transform((v) => getAddress(v));
/** A decimal amount of the gas token, such as "0.25", read as wei. */
const wbt = z.string().regex(/^\d+(\.\d{1,18})?$/, "must be a decimal amount, like 0.25").transform((v) => parseEther(v));
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
  DATABASE_URL: z.string().url().optional(),
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
  /** Relayer limits. Most WBT spent in any rolling 24 hours, overall and per app. */
  RELAYER_DAILY_BUDGET: wbt.default(parseEther("0.25")),
  APP_DAILY_GAS_BUDGET: wbt.default(parseEther("0.1")),
  /** Below this WBT balance, only exits go out: release, payout, revoke, cancel claim. */
  RELAYER_MIN_BALANCE: wbt.default(parseEther("0.05")),
  MAX_TX_GAS: z.coerce.bigint().positive().default(500_000n),
  MAX_GAS_PRICE_GWEI: z.coerce.number().positive().default(50),
  /** Smallest charge or hold, and smallest send or claim link, in credits. Dust would only burn gas. */
  MIN_CHARGE_CREDITS: z.string().regex(/^\d+(\.\d{1,4})?$/).default("1"),
  MIN_SEND_CREDITS: z.string().regex(/^\d+(\.\d{1,4})?$/).default("1"),
  /** New accounts and claim-link redemptions allowed per IP, per hour. */
  SIGNUPS_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
  CLAIMS_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(10),
  // Test USDT handed to new users from the operator wallet, so anyone can try the network. 0 turns it off.
  FAUCET_USDT: z.string().regex(/^\d+(\.\d{1,6})?$/).default("0.5"),
  FAUCET_DAILY_LIMIT: z.coerce.number().int().nonnegative().default(40),
  FAUCET_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(3),
  /** How often the indexer reads new blocks, and how many blocks one eth_getLogs call covers. */
  INDEXER_INTERVAL_MS: z.coerce.number().int().min(250).default(2_000),
  LOG_CHUNK: z.coerce.number().int().min(1).max(10_000).default(1_000),
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
  /** Postgres. Without it, an embedded Postgres under dataDir. */
  databaseUrl?: string;
  txTimeoutMs: number;
  privy?: { appId: string; appSecret: string };
  webOrigins: string[];
  adminToken?: string;
  networkFeeBps: number;
  rateLimitPerMin: number;
  holdTtlSeconds: number;
  relayerLimits: RelayerLimits;
  indexerIntervalMs: number;
  logChunk: number;
  /** In USDT units. */
  minChargeUnits: bigint;
  minSendUnits: bigint;
  signupsPerIpPerHour: number;
  claimsPerIpPerHour: number;
  /** Test USDT per new user, in USDT base units (6 decimals). Undefined when off. */
  faucet?: { units: bigint; usdt: string; dailyLimit: number; perIpPerHour: number };
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

  if (e.APP_DAILY_GAS_BUDGET > e.RELAYER_DAILY_BUDGET) {
    throw new Error("APP_DAILY_GAS_BUDGET can't be above RELAYER_DAILY_BUDGET");
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
    databaseUrl: e.DATABASE_URL,
    txTimeoutMs: e.TX_TIMEOUT_MS,
    privy: e.PRIVY_APP_ID && e.PRIVY_APP_SECRET ? { appId: e.PRIVY_APP_ID, appSecret: e.PRIVY_APP_SECRET } : undefined,
    webOrigins: e.WEB_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    adminToken: e.ADMIN_TOKEN ?? (local ? "dev-admin" : undefined),
    networkFeeBps: e.NETWORK_FEE_BPS,
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    holdTtlSeconds: e.HOLD_TTL_SECONDS,
    relayerLimits: {
      maxTxGas: e.MAX_TX_GAS,
      maxGasPrice: parseGwei(String(e.MAX_GAS_PRICE_GWEI)),
      dailyBudget: e.RELAYER_DAILY_BUDGET,
      appDailyBudget: e.APP_DAILY_GAS_BUDGET,
      minBalance: e.RELAYER_MIN_BALANCE,
    },
    indexerIntervalMs: e.INDEXER_INTERVAL_MS,
    logChunk: e.LOG_CHUNK,
    minChargeUnits: creditsToUnits(e.MIN_CHARGE_CREDITS),
    minSendUnits: creditsToUnits(e.MIN_SEND_CREDITS),
    signupsPerIpPerHour: e.SIGNUPS_PER_IP_PER_HOUR,
    claimsPerIpPerHour: e.CLAIMS_PER_IP_PER_HOUR,
    faucet:
      parseUnits(e.FAUCET_USDT, 6) > 0n && e.FAUCET_DAILY_LIMIT > 0
        ? { units: parseUnits(e.FAUCET_USDT, 6), usdt: e.FAUCET_USDT, dailyLimit: e.FAUCET_DAILY_LIMIT, perIpPerHour: e.FAUCET_PER_IP_PER_HOUR }
        : undefined,
  };
}
