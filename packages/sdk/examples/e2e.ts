/**
 * The whole money flow, end to end, through the public SDK, against the vault on NEAR testnet.
 *
 *   USER_ACCOUNT_ID=you.testnet ADMIN_TOKEN=... API_URL=http://localhost:4000 npm run e2e -w kredo
 *
 * A company registers and sets prices. A user tops up and approves a limit for the app. The
 * company then charges, holds and captures, holds and releases, refunds, and is paid out in USDT.
 * Every transaction prints its explorer link.
 *
 * The user here signs with their own NEAR key, standing in for the hosted connect and buy pages,
 * and needs test USDT (npm run fund:testnet -- you.testnet) and a little NEAR for gas.
 * Env: API_URL, ADMIN_TOKEN, CREDITS_API_KEY (skip registering), USER_ACCOUNT_ID, and
 * USER_PRIVATE_KEY (ed25519:..., else read from ~/.near-credentials/testnet).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, actions, JsonRpcProvider, KeyPairSigner, type KeyPairString } from "near-api-js";
import { Credits, CreditsError, CreditsNetwork } from "../src/index.js";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin-token";
const EXPLORER = process.env.EXPLORER_URL ?? "https://testnet.nearblocks.io";
const RPC = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
const userId = process.env.USER_ACCOUNT_ID;
if (!userId) throw new Error("Set USER_ACCOUNT_ID to a testnet account that holds test USDT and a little NEAR");

function userKey(): KeyPairString {
  if (process.env.USER_PRIVATE_KEY) return process.env.USER_PRIVATE_KEY as KeyPairString;
  const file = join(homedir(), ".near-credentials", "testnet", `${userId}.json`);
  return (JSON.parse(readFileSync(file, "utf8")) as { private_key: KeyPairString }).private_key;
}

const UNITS_PER_CREDIT = 10_000n;
const step = (title: string) => console.log(`\n${title}`);
const line = (label: string, value: string) => console.log(`  ${label.padEnd(26)} ${value}`);

async function main() {
  const net = new CreditsNetwork({ baseUrl: API_URL });
  const health = await net.health();
  step(`Kredo on NEAR ${health.network}, block ${health.block}`);
  line("vault", health.vault);
  line("relayer gas balance", `${health.relayer.balance} ${health.relayer.symbol}`);

  // ---------------------------------------------------------------- company
  let apiKey = process.env.CREDITS_API_KEY;
  if (!apiKey) {
    step("Company registers");
    const res = await fetch(`${API_URL}/v1/admin/apps`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: `Demo ${new Date().toISOString().slice(11, 19)}`, payout: userId }),
    });
    const body = (await res.json()) as { id: string; apiKey: string; explorer?: string; error?: string };
    if (!res.ok) throw new Error(`register failed: ${body.error}`);
    apiKey = body.apiKey;
    line("app", body.id);
    if (body.explorer) line("registered", body.explorer);
  }
  const credits = new Credits({ apiKey, baseUrl: API_URL });
  const app = await credits.app();
  await credits.setPrices({ "chat.message": { price: 1 }, "video.render": { rate: 2, unit: "second" } });
  const quote = await credits.quote({ action: "video.render", quantity: 10 });
  line("10s render costs", `${quote.price.credits} credits ($${quote.price.usd}), company keeps $${quote.youEarn.usd}`);

  // ---------------------------------------------------------------- user
  const user = new Account(userId!, new JsonRpcProvider({ url: RPC }), KeyPairSigner.fromSecretKey(userKey()));
  const call = async (label: string, contract: string, method: string, args: Record<string, unknown>, deposit = 0n) => {
    const res = await user.signAndSendTransaction({
      receiverId: contract,
      actions: [actions.functionCall(method, args, 100_000_000_000_000n, deposit)],
      waitUntil: "FINAL",
    });
    line(label, `${EXPLORER}/txns/${res.transaction.hash}`);
  };

  step("User tops up and connects the app");
  const state = await credits.user(userId!);
  const need = 60n * UNITS_PER_CREDIT;
  if (BigInt(state.balance.units) < need) {
    // NEP-141: the token moves USDT to the vault and calls its ft_on_transfer, which credits the sender.
    await call("deposit 60 credits", health.usdt, "ft_transfer_call", { receiver_id: health.vault, amount: need.toString(), msg: "" }, 1n);
  }
  await call("approve 50 credit limit", health.vault, "approve_app", { app: app.id, limit: (50n * UNITS_PER_CREDIT).toString(), expiry: null });
  const connected = await credits.user(userId!);
  line("balance / spendable", `${connected.balance.credits} / ${connected.spendable.credits} credits`);

  // ---------------------------------------------------------------- spending
  step("Company charges, holds, captures, releases and refunds");
  const charge = await credits.charge({ user: userId!, action: "chat.message", ref: `msg-${Date.now()}` });
  line(`charge ${charge.amount.credits}`, charge.explorer ?? charge.txHash);

  const hold = await credits.hold({ user: userId!, action: "video.render", quantity: 10 });
  line(`hold ${hold.amount.credits}`, hold.explorer ?? hold.txHash);
  const captured = await credits.capture(hold.holdId, { credits: 14 });
  line(`capture 14, return ${captured.returned.credits}`, captured.explorer ?? captured.txHash);

  const failed = await credits.hold({ user: userId!, action: "video.render", quantity: 5 });
  const released = await credits.release(failed.holdId);
  line(`release ${released.amount.credits}`, released.explorer ?? released.txHash);

  const refund = await credits.refund({ user: userId!, credits: 1 });
  line("refund 1", refund.explorer ?? refund.txHash);

  try {
    await credits.charge({ user: userId!, credits: 10_000 });
  } catch (err) {
    if (!(err instanceof CreditsError) || !err.isDeclined) throw err;
    line("over the limit", `declined (${err.code}), no gas spent`);
  }

  // ---------------------------------------------------------------- money out
  step("Company is paid out in USDT");
  const payout = await credits.payout();
  line(`payout $${payout.usdt}`, payout.explorer ?? payout.txHash);
  const gas = await credits.gas();
  line("gas paid by network", `${gas.gas} ${gas.symbol} over ${gas.transactions} transactions`);

  const reserves = await net.reserves();
  step(`Reserves: ${reserves.backed ? "fully backed" : "NOT BACKED"}`);
  line("USDT in vault", `$${reserves.usdtInVault.usd}`);
  line("owed", `$${reserves.owed.usd}`);
}

main().catch((err) => {
  console.error(`\n${err instanceof CreditsError ? `${err.code}: ` : ""}${err.message}`);
  process.exit(1);
});
