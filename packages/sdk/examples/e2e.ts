/**
 * The whole money flow, end to end, through the public SDK.
 *
 *   npm run e2e -w @credits/sdk                       # local: anvil + API running
 *   CHAIN=whitechain USER_KEY=0x... ADMIN_TOKEN=... API_URL=http://localhost:4000 npm run e2e -w @credits/sdk
 *
 * A company registers and sets prices. A user tops up and approves a limit for the app. The
 * company then charges, holds and captures, holds and releases, refunds, and is paid out in USDT.
 * Every transaction prints its explorer link.
 *
 * The user here signs onchain with a local key, standing in for the hosted connect and buy pages.
 * Env: API_URL, ADMIN_TOKEN (default dev-admin), CREDITS_API_KEY (skip registering), USER_KEY,
 * CHAIN (local | whitechain).
 */
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, whitechainSepolia } from "viem/chains";
import { Credits, CreditsError, CreditsNetwork } from "../src/index.js";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin";
const onWhitechain = process.env.CHAIN === "whitechain";
const chain = onWhitechain ? whitechainSepolia : anvil;
/** Anvil's second account, so the user isn't the operator. */
const LOCAL_USER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const userKey = (process.env.USER_KEY ?? (onWhitechain ? undefined : LOCAL_USER_KEY)) as Hex | undefined;
if (!userKey) throw new Error("Set USER_KEY to a wallet that holds test USDT and a little WBT");

const vaultAbi = parseAbi([
  "function deposit(address user, uint256 amount)",
  "function approveApp(address user, address app, uint256 limit, uint64 expiry, bytes32 nonce, uint256 deadline, bytes signature)",
]);
const usdtAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

const UNITS_PER_CREDIT = 10_000n;
const step = (title: string) => console.log(`\n${title}`);
const line = (label: string, value: string) => console.log(`  ${label.padEnd(26)} ${value}`);

async function main() {
  const net = new CreditsNetwork({ baseUrl: API_URL });
  const health = await net.health();
  step(`Network on chain ${health.chainId}, block ${health.block}`);
  line("vault", health.vault);
  line("relayer gas balance", `${health.relayer.balance} ${health.relayer.symbol}`);

  // ---------------------------------------------------------------- company
  let apiKey = process.env.CREDITS_API_KEY;
  if (!apiKey) {
    step("Company registers");
    const res = await fetch(`${API_URL}/v1/admin/apps`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: `Demo ${new Date().toISOString().slice(11, 19)}`, payout: privateKeyToAccount(userKey!).address }),
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
  const user = privateKeyToAccount(userKey!);
  const transport = http(onWhitechain ? undefined : "http://127.0.0.1:8545");
  const pub = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account: user, chain, transport });
  const send = async (label: string, request: Parameters<typeof wallet.writeContract>[0]) => {
    const hash = await wallet.writeContract(request);
    await pub.waitForTransactionReceipt({ hash });
    line(label, explorer(hash));
  };

  step("User tops up and connects the app");
  const state = await credits.user(user.address);
  const need = 60n * UNITS_PER_CREDIT;
  if (BigInt(state.balance.units) < need) {
    const usdt = health.usdt as Address;
    if (!onWhitechain) await send("mint test USDT", { address: usdt, abi: usdtAbi, functionName: "mint", args: [user.address, need] } as never);
    await send("approve USDT", { address: usdt, abi: usdtAbi, functionName: "approve", args: [health.vault as Address, need] } as never);
    await send("deposit 60 credits", { address: health.vault as Address, abi: vaultAbi, functionName: "deposit", args: [user.address, need] } as never);
  }
  await send("approve 50 credit limit", {
    address: health.vault as Address,
    abi: vaultAbi,
    functionName: "approveApp",
    args: [user.address, app.id as Address, 50n * UNITS_PER_CREDIT, 0n, `0x${"00".repeat(32)}`, 0n, "0x"],
  } as never);
  const connected = await credits.user(user.address);
  line("balance / spendable", `${connected.balance.credits} / ${connected.spendable.credits} credits`);

  // ---------------------------------------------------------------- spending
  step("Company charges, holds, captures, releases and refunds");
  const charge = await credits.charge({ user: user.address, action: "chat.message", ref: `msg-${Date.now()}` });
  line(`charge ${charge.amount.credits}`, charge.explorer ?? charge.txHash);

  const hold = await credits.hold({ user: user.address, action: "video.render", quantity: 10 });
  line(`hold ${hold.amount.credits}`, hold.explorer ?? hold.txHash);
  const captured = await credits.capture(hold.holdId, { credits: 14 });
  line(`capture 14, return ${captured.returned.credits}`, captured.explorer ?? captured.txHash);

  const failed = await credits.hold({ user: user.address, action: "video.render", quantity: 5 });
  const released = await credits.release(failed.holdId);
  line(`release ${released.amount.credits}`, released.explorer ?? released.txHash);

  const refund = await credits.refund({ user: user.address, credits: 1 });
  line("refund 1", refund.explorer ?? refund.txHash);

  try {
    await credits.charge({ user: user.address, credits: 10_000 });
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

function explorer(hash: string) {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : hash;
}

main().catch((err) => {
  console.error(`\n${err instanceof CreditsError ? `${err.code}: ` : ""}${err.message}`);
  process.exit(1);
});
