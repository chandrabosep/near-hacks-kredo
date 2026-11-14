/**
 * Buys Kredo credits on the mainnet vault from any chain, through NEAR Intents (1Click).
 *
 *   npx tsx scripts/intents-buy.ts --user alice.near --credits 100 --from USDC@base --refund 0xYourBaseAddress
 *   npx tsx scripts/intents-buy.ts --watch <depositAddress>             # follow a purchase again
 *   npx tsx scripts/intents-buy.ts ... --dry                            # price only, nothing to pay
 *
 * 1. Registers --user's vault storage (NEP-145) if needed, signed by --payer with near-cli. Without
 *    it the vault refunds the deposit instead of crediting it.
 * 2. Asks 1Click for exactly --credits worth of USDT into the vault, credited to --user.
 * 3. Prints the deposit address. You pay it from your own wallet on that chain.
 * 4. Watches the swap until it settles, then prints the NEAR transactions and the vault balance.
 *
 * --payer defaults to the owner in contracts/deployments/mainnet.json, and must have a key in
 * ~/.near-credentials/mainnet. Anyone can pay for anyone's registration, so a judge can use their own.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createIntents, settled, type IntentsStatus } from "../apps/api/src/intents.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { values: a } = parseArgs({
  options: {
    user: { type: "string" },
    credits: { type: "string" },
    from: { type: "string", default: "USDC@base" },
    refund: { type: "string" },
    payer: { type: "string" },
    network: { type: "string", default: "mainnet" },
    watch: { type: "string" },
    dry: { type: "boolean", default: false },
  },
});

const network = a.network!;
const deployment = JSON.parse(readFileSync(join(root, `contracts/deployments/${network}.json`), "utf8")) as {
  vault: string;
  usdt: string;
  owner: string;
  rpc: string;
  explorer: string;
};
// NEAR Intents only exists on mainnet, and only the mainnet vault holds the USDT it delivers.
const dry = a.dry || network !== "mainnet";
const usdt = network === "mainnet" ? deployment.usdt : "usdt.tether-token.near";
// 1Click only quotes to accounts that exist on mainnet; a dry quote's price doesn't depend on it.
const quoteVault = network === "mainnet" ? deployment.vault : "intents.near";
const intents = createIntents({ jwt: process.env.ONECLICK_JWT || undefined });
const RPC = process.env.NEAR_RPC_URL ?? deployment.rpc;

async function view<T>(contract: string, method: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
    }),
  });
  const json = (await res.json()) as { result?: { result: number[] }; error?: unknown };
  if (!json.result) throw new Error(`${contract}.${method}: ${JSON.stringify(json.error)}`);
  return JSON.parse(Buffer.from(json.result.result).toString());
}

/** 2500000000000000000000 -> "0.0025" */
function yoctoToNear(yocto: bigint): string {
  const whole = yocto / 10n ** 24n;
  const frac = (yocto % 10n ** 24n).toString().padStart(24, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

const credits = (units: string | bigint) => (Number(units) / 10_000).toLocaleString("en-US", { maximumFractionDigits: 4 });
const usd = (units: string | bigint) => `$${(Number(units) / 1_000_000).toFixed(2)}`;

async function ensureRegistered(user: string, payer: string) {
  if ((await view<unknown>(deployment.vault, "storage_balance_of", { account_id: user })) !== null) {
    console.log(`  ${user} is already registered with the vault`);
    return;
  }
  const { min } = await view<{ min: string }>(deployment.vault, "storage_balance_bounds", {});
  const near = yoctoToNear(BigInt(min));
  console.log(`  registering ${user} with the vault: ${near} NEAR of storage, paid by ${payer}`);
  const out = execFileSync(
    "near",
    [
      "contract", "call-function", "as-transaction", deployment.vault, "storage_deposit",
      "json-args", JSON.stringify({ account_id: user, registration_only: true }),
      "prepaid-gas", "30 Tgas", "attached-deposit", `${near} NEAR`,
      "sign-as", payer, "network-config", network, "sign-with-legacy-keychain", "send",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const tx = out.replace(/\x1b\[[0-9;]*m/g, "").match(/Transaction ID: ([A-Za-z0-9]+)/)?.[1];
  console.log(`  registered${tx ? `: ${deployment.explorer}/txns/${tx}` : ""}`);
}

async function watch(depositAddress: string, user: string | undefined, depositMemo?: string) {
  console.log(`\nwatching ${depositAddress} (Ctrl+C stops watching, not the swap)`);
  let last: IntentsStatus | undefined;
  for (;;) {
    const s = await intents.status(depositAddress, depositMemo);
    if (s.status !== last) {
      console.log(`  ${new Date().toISOString().slice(11, 19)}  ${s.status}`);
      last = s.status;
    }
    if (settled(s.status)) {
      for (const h of s.originTxHashes) console.log(`  origin tx  ${h}`);
      for (const h of s.nearTxHashes) console.log(`  NEAR tx    ${deployment.explorer}/txns/${h}`);
      if (s.status === "SUCCESS" && user) {
        const balance = await view<string>(deployment.vault, "balance_of", { user });
        console.log(`\n  ${user} now holds ${credits(balance)} credits (${usd(balance)}) in ${deployment.vault}`);
      }
      if (s.status !== "SUCCESS") console.log(`  refunded: ${s.refundedAmount ?? "see 1Click status"}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

async function main() {
  if (a.watch) {
    const saved = (() => {
      try {
        return JSON.parse(readFileSync(join(root, ".intents", `${a.watch}.json`), "utf8")) as { user?: string; depositMemo?: string };
      } catch {
        return {};
      }
    })();
    return watch(a.watch, a.user ?? saved.user, saved.depositMemo);
  }

  const user = a.user ?? fail("--user is required: the NEAR account to credit");
  const refund = a.refund ?? fail("--refund is required: your address on the paying chain, for refunds");
  const n = Number(a.credits ?? fail("--credits is required, e.g. --credits 100 for $1"));
  if (!Number.isFinite(n) || n < 1) fail("--credits must be at least 1");
  const units = BigInt(Math.round(n * 10_000));

  const [symbol, chain] = a.from!.split("@");
  const token = (await intents.payable()).find((t) => t.assetId === a.from || (t.symbol.toLowerCase() === symbol?.toLowerCase() && t.blockchain === chain?.toLowerCase()));
  if (!token) fail(`no payable token ${a.from}. Try USDC@base, USDC@arb, USDC@eth, USDC@sol, ETH@eth, SOL@sol, BTC@btc`);

  console.log(`buying ${credits(units)} credits (${usd(units)} of USDT) on ${deployment.vault}, ${network}${dry ? ", DRY: price only" : ""}`);
  console.log(`  credited to ${user}, paid in ${token.symbol} on ${token.blockchain}`);

  if (!dry) await ensureRegistered(user, a.payer ?? deployment.owner);

  const q = await intents.quote({ originAsset: token.assetId, units, user, vault: quoteVault, usdt, refundTo: refund, dry });
  console.log(`\n  send        ${q.amountInFormatted} ${token.symbol} on ${token.blockchain}${q.amountInUsd ? ` (~$${Number(q.amountInUsd).toFixed(2)})` : ""}`);
  console.log(`  vault gets  ${usd(q.amountOut)} USDT = ${credits(q.amountOut)} credits for ${user}`);
  console.log(`  takes       ~${q.timeEstimate ?? "?"} s after the deposit lands`);
  if (dry) {
    console.log("\n  dry quote: there is no deposit address. Run without --dry on mainnet to buy.");
    return;
  }
  console.log(`  deposit to  ${q.depositAddress}${q.depositMemo ? `  memo ${q.depositMemo}` : ""}`);
  console.log(`  before      ${q.deadline}`);

  // Keep the signed quote: it's the proof of what 1Click promised for this deposit address.
  mkdirSync(join(root, ".intents"), { recursive: true });
  writeFileSync(join(root, ".intents", `${q.depositAddress}.json`), JSON.stringify({ user, network, vault: deployment.vault, ...q }, null, 2));
  console.log(`  quote saved .intents/${q.depositAddress}.json`);

  await watch(q.depositAddress!, user, q.depositMemo);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
