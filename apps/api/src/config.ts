import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyPairString } from "near-api-js";
import { z } from "zod";
import { accountIdSchema, keyFromCredentials, parseNear, TGAS, type AccountId } from "./near.js";
import type { RelayerLimits } from "./relayer.js";
import { creditsToUnits } from "./units.js";

export const NETWORKS = {
  // NEAR's own public RPC (rpc.*.near.org) is deprecated and rate limited; FastNEAR is its recommended replacement.
  testnet: { rpcUrl: "https://test.rpc.fastnear.com", explorerUrl: "https://testnet.nearblocks.io" },
  mainnet: { rpcUrl: "https://free.rpc.fastnear.com", explorerUrl: "https://nearblocks.io" },
} as const;
export type Network = keyof typeof NETWORKS;

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEPLOYMENTS_DIR = resolve(here, "../../../contracts/deployments");

/** A decimal amount of NEAR, such as "0.25", read as yoctoNEAR. */
const near = z.string().regex(/^\d+(\.\d{1,24})?$/, "must be a NEAR amount, like 0.25").transform(parseNear);
const secretKey = z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,90}$/, "must be an ed25519 secret key, ed25519:...");

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NEAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  NEAR_RPC_URL: z.url().optional(),
  /** Block explorer for transaction links. Defaults to NearBlocks for the network. */
  EXPLORER_URL: z.url().optional(),
  /** The relayer: an operator on the vault that signs every transaction and pays its gas. */
  RELAYER_ACCOUNT_ID: accountIdSchema.optional(),
  /** Its key. Without one, it's read from near-cli's credentials folder. */
  RELAYER_PRIVATE_KEY: secretKey.optional(),
  NEAR_CREDENTIALS_DIR: z.string().default("~/.near-credentials"),
  VAULT_ACCOUNT_ID: accountIdSchema.optional(),
  USDT_ACCOUNT_ID: accountIdSchema.optional(),
  DEPLOYMENTS_DIR: z.string().default(DEFAULT_DEPLOYMENTS_DIR),
  DATA_DIR: z.string().default("./data"),
  DATABASE_URL: z.string().url().optional(),
  /** Privy app credentials. Without them, user routes answer 503. */
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(),
  /** Origins of our hosted pages, comma separated. They may call user routes with cookies. */
  WEB_ORIGINS: z.string().default("http://localhost:3000"),
  /** Guards /v1/admin. Without it, admin routes are off. */
  ADMIN_TOKEN: z.string().min(8).optional(),
  /** Network fee for new apps, in basis points. 500 = 5%. */
  NETWORK_FEE_BPS: z.coerce.number().int().min(0).max(2_000).default(500),
  /** Write requests per minute per API key. */
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  /** Default and longest hold, in seconds. The contract caps holds at one day. */
  HOLD_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  /** Relayer limits, in NEAR. Most spent in any rolling 24 hours, overall and per app. */
  RELAYER_DAILY_BUDGET: near.default(parseNear("1")),
  APP_DAILY_GAS_BUDGET: near.default(parseNear("0.5")),
  /** Below this NEAR balance, only exits go out: release, payout, revoke, cancel claim. */
  RELAYER_MIN_BALANCE: near.default(parseNear("0.3")),
  /** Most gas one transaction may attach, in Tgas. NEAR allows 300. */
  MAX_TX_TGAS: z.coerce.number().int().min(10).max(300).default(300),
  /** NEAR sent to a new user's implicit account so it exists onchain and can sign. */
  USER_ACCOUNT_NEAR: near.default(parseNear("0.01")),
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
  /** How often the indexer sweeps expired holds, delivers webhooks and checks the backing. */
  INDEXER_INTERVAL_MS: z.coerce.number().int().min(250).default(5_000),
});

const deploymentSchema = z.object({
  network: z.string(),
  vault: accountIdSchema,
  usdt: accountIdSchema,
  operator: accountIdSchema.optional(),
});

export type Config = {
  port: number;
  network: Network;
  rpcUrl: string;
  explorerUrl: string;
  relayerId: AccountId;
  relayerKey: KeyPairString;
  vault: AccountId;
  usdt: AccountId;
  dataDir: string;
  /** Postgres. Without it, an embedded Postgres under dataDir. */
  databaseUrl?: string;
  privy?: { appId: string; appSecret: string };
  webOrigins: string[];
  adminToken?: string;
  networkFeeBps: number;
  rateLimitPerMin: number;
  holdTtlSeconds: number;
  relayerLimits: RelayerLimits;
  /** yoctoNEAR sent to activate a new user's account. */
  userAccountYocto: bigint;
  indexerIntervalMs: number;
  /** In USDT units. */
  minChargeUnits: bigint;
  minSendUnits: bigint;
  signupsPerIpPerHour: number;
  claimsPerIpPerHour: number;
  /** Test USDT per new user, in USDT base units (6 decimals). Undefined when off. */
  faucet?: { units: bigint; usdt: string; dailyLimit: number; perIpPerHour: number };
};

/**
 * Reads config from the environment. The vault, USDT and relayer accounts come from
 * contracts/deployments/<network>.json unless they're set.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const e = parsed.data;
  const network = e.NEAR_NETWORK;

  let vault = e.VAULT_ACCOUNT_ID;
  let usdt = e.USDT_ACCOUNT_ID;
  let relayerId = e.RELAYER_ACCOUNT_ID;
  if (!vault || !usdt || !relayerId) {
    const file = resolve(e.DEPLOYMENTS_DIR, `${network}.json`);
    if (!existsSync(file)) {
      throw new Error(`No deployment found at ${file}. Set VAULT_ACCOUNT_ID, USDT_ACCOUNT_ID and RELAYER_ACCOUNT_ID.`);
    }
    const d = deploymentSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    if (d.network !== network) throw new Error(`${file} is for ${d.network}, not ${network}`);
    vault ??= d.vault;
    usdt ??= d.usdt;
    relayerId ??= d.operator;
  }
  if (!relayerId) throw new Error("RELAYER_ACCOUNT_ID is required");

  const relayerKey = (e.RELAYER_PRIVATE_KEY as KeyPairString | undefined) ?? keyFromCredentials(e.NEAR_CREDENTIALS_DIR, network, relayerId);
  if (!relayerKey) {
    throw new Error(`No key for ${relayerId}. Set RELAYER_PRIVATE_KEY, or log in with near-cli so ${e.NEAR_CREDENTIALS_DIR}/${network}/${relayerId}.json exists.`);
  }

  if (e.APP_DAILY_GAS_BUDGET > e.RELAYER_DAILY_BUDGET) {
    throw new Error("APP_DAILY_GAS_BUDGET can't be above RELAYER_DAILY_BUDGET");
  }

  if ((e.PRIVY_APP_ID === undefined) !== (e.PRIVY_APP_SECRET === undefined)) {
    throw new Error("Set both PRIVY_APP_ID and PRIVY_APP_SECRET, or neither");
  }

  return {
    port: e.PORT,
    network,
    rpcUrl: e.NEAR_RPC_URL ?? NETWORKS[network].rpcUrl,
    explorerUrl: (e.EXPLORER_URL ?? NETWORKS[network].explorerUrl).replace(/\/$/, ""),
    relayerId,
    relayerKey,
    vault,
    usdt,
    dataDir: e.DATA_DIR,
    databaseUrl: e.DATABASE_URL,
    privy: e.PRIVY_APP_ID && e.PRIVY_APP_SECRET ? { appId: e.PRIVY_APP_ID, appSecret: e.PRIVY_APP_SECRET } : undefined,
    webOrigins: e.WEB_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    adminToken: e.ADMIN_TOKEN,
    networkFeeBps: e.NETWORK_FEE_BPS,
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    holdTtlSeconds: e.HOLD_TTL_SECONDS,
    relayerLimits: {
      maxTxGas: BigInt(e.MAX_TX_TGAS) * TGAS,
      dailyBudget: e.RELAYER_DAILY_BUDGET,
      appDailyBudget: e.APP_DAILY_GAS_BUDGET,
      minBalance: e.RELAYER_MIN_BALANCE,
    },
    userAccountYocto: e.USER_ACCOUNT_NEAR,
    indexerIntervalMs: e.INDEXER_INTERVAL_MS,
    minChargeUnits: creditsToUnits(e.MIN_CHARGE_CREDITS),
    minSendUnits: creditsToUnits(e.MIN_SEND_CREDITS),
    signupsPerIpPerHour: e.SIGNUPS_PER_IP_PER_HOUR,
    claimsPerIpPerHour: e.CLAIMS_PER_IP_PER_HOUR,
    faucet:
      usdtUnits(e.FAUCET_USDT) > 0n && e.FAUCET_DAILY_LIMIT > 0
        ? { units: usdtUnits(e.FAUCET_USDT), usdt: e.FAUCET_USDT, dailyLimit: e.FAUCET_DAILY_LIMIT, perIpPerHour: e.FAUCET_PER_IP_PER_HOUR }
        : undefined,
  };
}

/** "0.5" USDT -> 500000 units (6 decimals). */
function usdtUnits(v: string): bigint {
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0") || "0");
}
