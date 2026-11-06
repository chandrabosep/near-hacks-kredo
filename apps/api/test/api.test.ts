/**
 * End to end over HTTP against a throwaway anvil chain: a company registers, a user buys,
 * connects and spends, and the company holds, captures, refunds and gets paid out.
 * Privy is replaced by a fake verifier; users sign with local keys, exactly as their Privy
 * wallet would sign the same EIP-712 messages in the browser.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { mockUSDTAbi } from "../src/abi/MockUSDT.js";
import { AuthError, type UserVerifier } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { createContext, type Context } from "../src/context.js";
import { signWebhook } from "../src/indexer.js";
import { createServer } from "../src/server.js";
import { ANVIL_KEY, skipChainTests as skip, startLocalChain, type LocalChain } from "./localChain.js";
import { vaultTypes } from "../src/typedData.js";

type Json = Record<string, any>;

let chain: LocalChain | undefined;
let ctx: Context;
let base: string;
let close: () => void;
let apiKey: string;
let appId: Address;

const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const payout = privateKeyToAccount(generatePrivateKey()).address;

/** Fake Privy: the token is the user's name. */
const users: Record<string, { account: PrivateKeyAccount; email: string }> = {
  alice: { account: alice, email: "alice@example.com" },
  bob: { account: bob, email: "bob@example.com" },
};
const verifier: UserVerifier = async (token) => {
  const u = users[token];
  if (!u) throw new AuthError("bad token");
  return { privyId: `did:privy:${token}`, address: u.account.address, email: u.email };
};

async function call(method: string, path: string, opts: { body?: unknown; key?: string; user?: string; admin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  if (opts.admin) headers.authorization = `Bearer ${opts.admin}`;
  if (opts.user) headers["privy-id-token"] = opts.user;
  const res = await fetch(`${base}${path}`, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  const body = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  return { status: res.status, body } as { status: number; body: any };
}

const company = (method: string, path: string, body?: unknown) => call(method, path, { key: apiKey, body });

/** What the browser does: sign the returned EIP-712 request with the user's wallet. */
async function sign(account: PrivateKeyAccount, request: Json): Promise<Hex> {
  const fields: { name: string; type: string }[] = request.types[request.primaryType];
  const message: Json = {};
  for (const f of fields) {
    const v = request.message[f.name];
    message[f.name] = f.type.startsWith("uint") ? BigInt(v) : v;
  }
  return account.signTypedData({ domain: request.domain, types: request.types, primaryType: request.primaryType, message });
}

/** sign/:action then submit/:action, as our hosted pages do. */
async function act(user: string, action: string, input: Json) {
  const prepared = await call("POST", `/v1/me/sign/${action}`, { user, body: input });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const signature = await sign(users[user].account, prepared.body.request);
  return call("POST", `/v1/me/submit/${action}`, { user, body: { message: prepared.body.request.message, signature } });
}

before(async () => {
  if (skip) return;
  chain = await startLocalChain();
  const config = loadConfig({
    RPC_URL: chain.rpcUrl,
    VAULT_ADDRESS: chain.vault,
    USDT_ADDRESS: chain.usdt,
    DATA_DIR: mkdtempSync(join(tmpdir(), "uc-api-")),
    OPERATOR_KEY: ANVIL_KEY,
  });
  ctx = await createContext(config, { verifier, memoryDb: true });
  const server = createServer(ctx).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();

  // Alice holds $20 of test USDT in her wallet, as if from the Whitechain booth.
  const hash = await chain.clients.walletClient.writeContract({
    address: chain.usdt,
    abi: mockUSDTAbi,
    functionName: "mint",
    args: [alice.address, 20_000_000n],
  });
  await chain.clients.publicClient.waitForTransactionReceipt({ hash });
});

after(async () => {
  close?.();
  ctx?.indexer.stop();
  await ctx?.db.close();
  chain?.stop();
});

describe("api", { skip }, () => {
  test("health and reserves", async () => {
    const h = await call("GET", "/v1/health");
    assert.equal(h.status, 200);
    assert.equal(h.body.login, "privy");
    const r = await call("GET", "/v1/reserves");
    assert.equal(r.body.backed, true);
  });

  test("admin registers an app and returns its key once", async () => {
    const bad = await call("POST", "/v1/admin/apps", { admin: "wrong-token", body: { name: "Video Studio", payout } });
    assert.equal(bad.status, 401);

    const res = await call("POST", "/v1/admin/apps", { admin: "dev-admin", body: { name: "Video Studio", payout } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.apiKey, /^uc_live_/);
    apiKey = res.body.apiKey;
    appId = res.body.id;

    const me = await company("GET", "/v1/app");
    assert.equal(me.body.name, "Video Studio");
    assert.equal(me.body.feeBps, 500);
  });

  test("company calls need a valid API key", async () => {
    assert.equal((await call("GET", "/v1/app")).status, 401);
    assert.equal((await call("GET", "/v1/app", { key: "uc_live_nope" })).status, 401);
  });

  test("company sets prices and quotes in credits and dollars", async () => {
    const put = await company("PUT", "/v1/prices", {
      prices: { "video.render": { rate: "8", unit: "second" }, "chat.message": { price: 2 } },
    });
    assert.equal(put.status, 200);
    const q = await company("GET", "/v1/quote?action=video.render&quantity=5");
    assert.deepEqual(q.body.price, { units: "400000", credits: "40", usd: "0.4" });
    assert.equal(q.body.youEarn.credits, "38");
  });

  test("user routes need a login", async () => {
    assert.equal((await call("GET", "/v1/me")).status, 401);
    assert.equal((await call("GET", "/v1/me", { user: "mallory" })).status, 401);
  });

  test("alice buys credits with a gasless permit", async () => {
    const res = await act("alice", "buy", { credits: 1000 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const me = await call("GET", "/v1/me", { user: "alice" });
    assert.equal(me.body.balance.credits, "1000");
    assert.equal(me.body.walletUsdt.usd, "10");
    assert.equal(me.body.email, "alice@example.com");
  });

  test("alice connects the app with a 200 credit limit", async () => {
    const res = await act("alice", "connect", { app: appId, credits: 200 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.connected, true);
    assert.equal(u.body.limit.credits, "200");
  });

  test("a signed message can't be submitted by another account", async () => {
    const prepared = await call("POST", "/v1/me/sign/connect", { user: "alice", body: { app: appId, credits: 999 } });
    const signature = await sign(alice, prepared.body.request);
    const res = await call("POST", "/v1/me/submit/connect", {
      user: "bob",
      body: { message: prepared.body.request.message, signature },
    });
    assert.equal(res.status, 403);
  });

  test("company charges by action, and a retried ref doesn't charge twice", async () => {
    const first = await company("POST", "/v1/charges", { user: alice.address, action: "chat.message", ref: "msg-1" });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.amount.credits, "2");
    assert.equal(first.body.fee.credits, "0.1");

    const again = await company("POST", "/v1/charges", { user: alice.address, action: "chat.message", ref: "msg-1" });
    assert.equal(again.status, 200);
    assert.equal(again.body.replayed, true);
    assert.equal(again.body.txHash, first.body.txHash);

    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.balance.credits, "998");
  });

  test("dust charges and sends are refused before they cost gas", async () => {
    const charge = await company("POST", "/v1/charges", { user: alice.address, credits: "0.5" });
    assert.equal(charge.status, 400);
    assert.equal(charge.body.code, "below_minimum");
    const send = await call("POST", "/v1/me/sign/send", { user: "alice", body: { to: bob.address, credits: "0.1" } });
    assert.equal(send.status, 400);
    assert.equal(send.body.code, "below_minimum");
  });

  test("the contract refuses a charge above the limit, with a clear error", async () => {
    const res = await company("POST", "/v1/charges", { user: alice.address, credits: 500 });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, "OverLimit");
  });

  test("hold, then capture part of it", async () => {
    const h = await company("POST", "/v1/holds", { user: alice.address, action: "video.render", quantity: 10, ref: "job-1" });
    assert.equal(h.status, 201, JSON.stringify(h.body));
    assert.equal(h.body.amount.credits, "80");

    const c = await company("POST", `/v1/holds/${h.body.holdId}/capture`, { credits: 40 });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.returned.credits, "40");
    const again = await company("POST", `/v1/holds/${h.body.holdId}/capture`, {});
    assert.equal(again.body.replayed, true);

    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.balance.credits, "958");
  });

  test("hold, then release returns everything", async () => {
    const h = await company("POST", "/v1/holds", { user: alice.address, credits: 30, ref: "job-2" });
    const r = await company("POST", `/v1/holds/${h.body.holdId}/release`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.balance.credits, "958");
  });

  test("refund, light-mode convert and payout", async () => {
    const refund = await company("POST", "/v1/refunds", { user: alice.address, credits: 2, ref: "msg-1" });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));

    await company("PUT", "/v1/exchange-rate", { rate: 2 });
    const conv = await company("POST", "/v1/convert", { user: alice.address, credits: 10 });
    assert.equal(conv.status, 201, JSON.stringify(conv.body));
    assert.equal(conv.body.appCredits, "5");

    const p = await company("POST", "/v1/payout");
    assert.equal(p.status, 200, JSON.stringify(p.body));
    const paid = await ctx.usdt.read.balanceOf([payout]);
    assert.equal(paid.toString(), p.body.amount.units);
  });

  test("send to a friend by email, then by claim link", async () => {
    await call("GET", "/v1/me", { user: "bob" }); // bob signs in once
    const sent = await act("alice", "send", { to: "bob@example.com", credits: 50 });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));

    const linkKey = privateKeyToAccount(generatePrivateKey());
    const created = await act("alice", "claim", { claimKey: linkKey.address, credits: 25 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal((await call("GET", `/v1/claims/${linkKey.address}`)).body.status, "open");

    // Bob opens the link: the link's key signs bob's address in his browser.
    const signature = await linkKey.signTypedData({
      domain: { name: "CreditVault", version: "1", chainId: 31337, verifyingContract: ctx.config.vault },
      types: { RedeemClaim: vaultTypes.RedeemClaim },
      primaryType: "RedeemClaim",
      message: { claimKey: linkKey.address, to: bob.address },
    });
    const redeemed = await call("POST", `/v1/claims/${linkKey.address}/redeem`, { user: "bob", body: { signature } });
    assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body));

    const me = await call("GET", "/v1/me", { user: "bob" });
    assert.equal(me.body.balance.credits, "75");
    assert.equal((await call("GET", `/v1/claims/${linkKey.address}`)).body.status, "claimed");
  });

  test("after disconnecting, the app can't charge", async () => {
    const res = await act("alice", "disconnect", { app: appId });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const charge = await company("POST", "/v1/charges", { user: alice.address, credits: 1 });
    assert.equal(charge.body.code, "OverLimit");
    const me = await call("GET", "/v1/me", { user: "alice" });
    assert.equal(me.body.connections[0].connected, false);
  });

  test("gas, CSV export and reserves", async () => {
    const gas = await company("GET", "/v1/gas");
    assert.ok(gas.body.transactions > 0);
    assert.equal(gas.body.paidBy, "network");

    const csv = await company("GET", "/v1/export.csv");
    assert.equal(csv.status, 200);
    const lines = String(csv.body).trim().split("\n");
    assert.equal(lines[0], "date,kind,ref,user,credits,usd,fee_credits,label,tx");
    assert.ok(lines.some((l) => l.includes(",capture,")));

    const r = await call("GET", "/v1/reserves");
    assert.equal(r.body.backed, true);
    assert.equal(r.body.surplus.units, "0");
  });

  // ---------------------------------------------------------------- indexer

  test("the indexer reads every vault event into activity and stats", async () => {
    await ctx.indexer.tick();
    const status = (await call("GET", "/v1/health")).body.indexer;
    assert.equal(status.lag, 0);
    assert.equal(status.backed, true);
    assert.equal(status.error, null);

    const mine = await call("GET", "/v1/me/activity", { user: "alice" });
    const types = new Set(mine.body.map((e: Json) => e.type));
    for (const t of ["Deposited", "AppApproved", "Charged", "Held", "Captured", "Released", "Refunded", "Sent", "AppRevoked"]) {
      assert.ok(types.has(t), `alice's activity has ${t}`);
    }
    assert.ok(mine.body[0].at >= mine.body.at(-1).at, "newest first");
    assert.ok(mine.body.every((e: Json) => e.explorer === undefined || typeof e.explorer === "string"));

    // Captured and Released name no user onchain; the indexer fills them in from the hold.
    const captured = mine.body.find((e: Json) => e.type === "Captured");
    assert.equal(captured.user, alice.address);
    assert.equal(captured.app, appId);

    const theirs = await company("GET", "/v1/activity?limit=500");
    assert.ok(theirs.body.length > 0);
    assert.ok(theirs.body.every((e: Json) => e.app === appId));
    const charge = theirs.body.find((e: Json) => e.type === "Charged" && e.ref);
    assert.ok(charge, "charges carry the app's own ref");
    assert.equal(charge.appName, "Video Studio");

    const stats = await call("GET", "/v1/stats");
    assert.equal(stats.body.deposited.credits, "1000");
    assert.ok(Number(stats.body.spent.credits) > 0);
    assert.ok(Number(stats.body.paidOut.units) > 0);

    // A second pass adds nothing: events are stored once.
    const count = ctx.db.data.events.length;
    await ctx.indexer.tick();
    assert.equal(ctx.db.data.events.length, count);
  });

  test("webhooks are signed, and a failed delivery is retried", async () => {
    const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
    let failNext = true;
    const hook = createHttpServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = failNext ? 500 : 200;
        failNext = false;
        res.end();
      });
    }).listen(0);
    await new Promise((r) => hook.once("listening", r));
    try {
      const url = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/hook`;
      const set = await company("PUT", "/v1/webhook", { url });
      const secret: string = set.body.secret;
      assert.match(secret, /^whsec_/);

      assert.equal((await act("alice", "connect", { app: appId, credits: 50 })).status, 201);
      const charged = await company("POST", "/v1/charges", { user: alice.address, credits: 3, ref: "hooked" });
      assert.equal(charged.status, 201, JSON.stringify(charged.body));

      await ctx.indexer.tick();
      assert.equal(received.length, 2, "connection.approved, then charge.succeeded");
      const pending = ctx.db.data.deliveries.filter((d) => d.status === "pending");
      assert.equal(pending.length, 1, "the first delivery failed and waits for a retry");

      for (const d of pending) d.nextAt = 0;
      await ctx.indexer.deliverDue();
      assert.equal(ctx.db.data.deliveries.filter((d) => d.status === "pending").length, 0);

      const last = received.find((r) => JSON.parse(r.body).type === "charge.succeeded")!;
      const payload = JSON.parse(last.body);
      assert.equal(payload.data.ref, "hooked");
      assert.equal(payload.data.amount.credits, "3");
      assert.equal(last.headers["x-credits-event"], "charge.succeeded");

      const sig = String(last.headers["x-credits-signature"]);
      const t = Number(/t=(\d+)/.exec(sig)![1]);
      assert.equal(sig, signWebhook(secret, last.body, t), "the signature checks out with the app's secret");

      const deliveries = await company("GET", "/v1/webhook/deliveries");
      assert.ok(deliveries.body.some((d: Json) => d.type === "charge.succeeded" && d.status === "delivered" && d.attempts >= 1));
    } finally {
      hook.close();
      await company("PUT", "/v1/webhook", { url: null });
    }
  });

  test("the sweeper releases an expired hold back to the user", async () => {
    const before = (await call("GET", "/v1/me", { user: "alice" })).body.balance.units;
    const held = await company("POST", "/v1/holds", { user: alice.address, credits: 4 });
    assert.equal(held.status, 201, JSON.stringify(held.body));

    // Pretend the hold's time is up. The operator may release at any time onchain.
    ctx.store.hold(held.body.holdId)!.expiry = 0;
    assert.equal(await ctx.indexer.sweep(), 1);
    assert.equal(ctx.store.hold(held.body.holdId)!.status, "released");
    assert.equal(await ctx.indexer.sweep(), 0, "nothing left to sweep");

    const after = (await call("GET", "/v1/me", { user: "alice" })).body.balance.units;
    assert.equal(after, before);
    const h = await company("GET", `/v1/holds/${held.body.holdId}`);
    assert.equal(h.body.status, "released");
  });

  // ---------------------------------------------------------------- connect codes

  test("connecting returns a one-time code that only this app can swap for the user", async () => {
    const connected = await act("alice", "connect", { app: appId, credits: 40 });
    assert.equal(connected.status, 201, JSON.stringify(connected.body));
    const code: string = connected.body.code;
    assert.match(code, /^cc_/);

    const other = await call("POST", "/v1/admin/apps", { admin: "dev-admin", body: { name: "Other App", payout } });
    const stolen = await call("POST", "/v1/connect/exchange", { key: other.body.apiKey, body: { code } });
    assert.equal(stolen.status, 400, "another app can't use it");

    // The failed attempt burned it, so connect again for a fresh one.
    const again = await act("alice", "connect", { app: appId, credits: 40 });
    const swapped = await company("POST", "/v1/connect/exchange", { code: again.body.code });
    assert.equal(swapped.status, 200, JSON.stringify(swapped.body));
    assert.equal(swapped.body.user, alice.address);
    assert.equal(swapped.body.limit.credits, "40");

    const replay = await company("POST", "/v1/connect/exchange", { code: again.body.code });
    assert.equal(replay.status, 400, "a code works once");
  });

  test("an already connected user gets a fresh code without signing again", async () => {
    const res = await call("POST", "/v1/me/connect-code", { user: "alice", body: { app: appId } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const swapped = await company("POST", "/v1/connect/exchange", { code: res.body.code });
    assert.equal(swapped.body.user, alice.address);

    const notYet = await call("POST", "/v1/me/connect-code", { user: "bob", body: { app: appId } });
    assert.equal(notYet.status, 409);
  });

  // ---------------------------------------------------------------- company dashboard

  test("a company profile comes first, and is checked", async () => {
    assert.equal((await call("GET", "/v1/me/company", { user: "bob" })).status, 404);
    const early = await call("POST", "/v1/me/apps", { user: "bob", body: { name: "Too Soon" } });
    assert.equal(early.status, 409);
    assert.equal(early.body.code, "no_company");

    const bad = await call("PUT", "/v1/me/company", { user: "bob", body: { name: "Bob Labs", website: "not a url", category: "cars" } });
    assert.equal(bad.status, 400);

    const saved = await call("PUT", "/v1/me/company", {
      user: "bob",
      body: { name: "Bob Labs", website: "https://bob.example", logoUrl: "https://bob.example/logo.png", category: "ai", supportEmail: "Help@Bob.example" },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.supportEmail, "help@bob.example");

    const edited = await call("PUT", "/v1/me/company", { user: "bob", body: { name: "Bob Labs", website: "https://bob.example", logoUrl: "", category: "ai" } });
    assert.equal(edited.body.logoUrl, null, "a blank field clears it");
    await call("PUT", "/v1/me/company", { user: "bob", body: { name: "Bob Labs", website: "https://bob.example", logoUrl: "https://bob.example/logo.png", category: "ai", supportEmail: "help@bob.example" } });
  });

  test("a signed-in owner registers an app and manages it without an API key", async () => {
    const made = await call("POST", "/v1/me/apps", { user: "bob", body: { name: "Bob's Chat", description: "Ask anything." } });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.match(made.body.apiKey, /^uc_live_/);
    assert.equal(made.body.payout, bob.address, "payout defaults to the owner's wallet");
    const id: string = made.body.id;

    const mine = await call("GET", "/v1/me/apps", { user: "bob" });
    assert.deepEqual(mine.body.map((a: Json) => a.name), ["Bob's Chat"]);
    assert.equal((await call("GET", "/v1/me/apps", { user: "alice" })).body.length, 0);

    // Every company route works under /me/apps/:id, for the owner only.
    const prices = await call("PUT", `/v1/me/apps/${id}/prices`, { user: "bob", body: { prices: { "chat.message": { price: 1 } } } });
    assert.equal(prices.status, 200, JSON.stringify(prices.body));
    const info = await call("GET", `/v1/me/apps/${id}/app`, { user: "bob" });
    assert.equal(info.body.name, "Bob's Chat");
    assert.equal((await call("GET", `/v1/me/apps/${id}/app`, { user: "alice" })).status, 404);

    const stats = await call("GET", `/v1/me/apps/${id}/stats`, { user: "bob" });
    assert.equal(stats.body.charges, 0);
    assert.equal(stats.body.revenue.units, "0");

    // The profile falls back to the company's, and shows in the public directory.
    assert.equal(info.body.logoUrl, "https://bob.example/logo.png");
    assert.equal(info.body.company.name, "Bob Labs");
    const profile = await call("PATCH", `/v1/me/apps/${id}/profile`, { user: "bob", body: { category: "productivity", website: "https://chat.bob.example" } });
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
    const listed = (await call("GET", "/v1/directory")).body.find((a: Json) => a.id === id);
    assert.equal(listed.description, "Ask anything.");
    assert.equal(listed.category, "productivity");
    assert.equal(listed.website, "https://chat.bob.example");
    assert.equal(listed.company.supportEmail, "help@bob.example");
    assert.equal((await call("PATCH", `/v1/me/apps/${id}/profile`, { user: "alice", body: { name: "Mine now" } })).status, 404);
  });

  test("rotating the key turns the old one off", async () => {
    const [app] = (await call("GET", "/v1/me/apps", { user: "bob" })).body;
    const made = await call("POST", "/v1/me/apps", { user: "bob", body: { name: "Second" } });
    const oldKey: string = made.body.apiKey;
    assert.equal((await call("GET", "/v1/app", { key: oldKey })).status, 200);

    const rotated = await call("POST", `/v1/me/apps/${made.body.id}/key`, { user: "bob" });
    assert.equal(rotated.status, 200);
    assert.equal((await call("GET", "/v1/app", { key: oldKey })).status, 401);
    assert.equal((await call("GET", "/v1/app", { key: rotated.body.apiKey })).body.name, "Second");
    assert.ok(app, "first app still listed");
  });

  test("named keys: create, use, list with last use, revoke", async () => {
    const [app] = (await call("GET", "/v1/me/apps", { user: "bob" })).body;
    const keys = `/v1/me/apps/${app.id}/keys`;

    const made = await call("POST", keys, { user: "bob", body: { name: "Production server", mode: "live" } });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.match(made.body.key, /^uc_live_/);
    assert.equal(made.body.lastUsedAt, null);
    assert.equal((await call("GET", "/v1/app", { key: made.body.key })).status, 200);

    const test = await call("POST", keys, { user: "bob", body: { name: "CI", mode: "test" } });
    assert.match(test.body.key, /^uc_test_/);
    assert.equal((await call("GET", "/v1/app", { key: test.body.key })).status, 200, "a test key runs in the sandbox");
    assert.equal((await call("PUT", "/v1/prices", { key: test.body.key, body: { prices: {} } })).body.code, "test_mode_unsupported", "and can't change live settings");

    const listed = (await call("GET", keys, { user: "bob" })).body;
    const prod = listed.find((k: Json) => k.id === made.body.id);
    assert.ok(prod.lastUsedAt, "last use is recorded");
    assert.equal(JSON.stringify(listed).includes(made.body.key), false, "keys are never listed in full");
    assert.equal((await call("GET", keys, { user: "alice" })).status, 404);

    const revoked = await call("DELETE", `${keys}/${made.body.id}`, { user: "bob" });
    assert.ok(revoked.body.revokedAt);
    assert.equal((await call("GET", "/v1/app", { key: made.body.key })).status, 401);
    assert.equal((await call("DELETE", `${keys}/nope`, { user: "bob" })).status, 404);
    assert.equal((await call("POST", keys, { user: "bob", body: { name: "", mode: "live" } })).status, 400);
  });

  test("an app holds at most ten active keys", async () => {
    const made = await call("POST", "/v1/me/apps", { user: "bob", body: { name: "Many Keys" } });
    const keys = `/v1/me/apps/${made.body.id}/keys`;
    // The first live key and the first test key come with the app.
    for (let i = 0; i < 8; i++) assert.equal((await call("POST", keys, { user: "bob", body: { name: `k${i}`, mode: "live" } })).status, 201);
    assert.equal((await call("POST", keys, { user: "bob", body: { name: "one too many", mode: "live" } })).body.code, "too_many_keys");
  });

  // ---------------------------------------------------------------- test mode

  test("a test key runs the same calls against fake credits, never the chain", async () => {
    const made = await call("POST", "/v1/admin/apps", { admin: "dev-admin", body: { name: "Sandbox App", payout } });
    const testKey: string = made.body.testKey;
    assert.match(testKey, /^uc_test_/);
    const t = (method: string, path: string, body?: unknown) => call(method, path, { key: testKey, body });
    const someone = privateKeyToAccount(generatePrivateKey()).address;
    const sentBefore = await chain!.clients.publicClient.getTransactionCount({ address: chain!.clients.operator.address });

    assert.equal((await t("PUT", "/v1/prices", { prices: {} })).body.code, "test_mode_unsupported", "config stays on the live key");
    const fresh = await t("GET", `/v1/users/${someone}`);
    assert.equal(fresh.body.balance.credits, "1000");
    assert.equal(fresh.body.limit.credits, "500");
    assert.equal(fresh.body.test, true);

    const swapped = await t("POST", "/v1/connect/exchange", { code: `cc_test_${someone}` });
    assert.equal(swapped.body.user, someone);

    const charge = await t("POST", "/v1/charges", { user: someone, credits: 10, ref: "t-1" });
    assert.equal(charge.status, 201);
    assert.equal(charge.body.test, true);
    assert.equal(charge.body.fee.credits, "0.5");
    assert.equal((await t("POST", "/v1/charges", { user: someone, credits: 10, ref: "t-1" })).body.replayed, true);

    const hold = await t("POST", "/v1/holds", { user: someone, credits: 40 });
    const cap = await t("POST", `/v1/holds/${hold.body.holdId}/capture`, { credits: 25 });
    assert.equal(cap.body.returned.credits, "15");
    const hold2 = await t("POST", "/v1/holds", { user: someone, credits: 5 });
    assert.equal((await t("POST", `/v1/holds/${hold2.body.holdId}/release`)).status, 200);
    assert.equal((await t("POST", "/v1/refunds", { user: someone, credits: 5 })).status, 201);

    const over = await t("POST", "/v1/charges", { user: someone, credits: 600 });
    assert.equal(over.status, 422);
    assert.equal(over.body.code, "OverLimit", "same refusals as the vault");

    const after = await t("GET", `/v1/users/${someone}`);
    assert.equal(after.body.balance.credits, "970", "1000 - 10 - 25 + 5 refund");
    assert.equal((await t("POST", "/v1/payout")).body.code, "test_mode_unsupported");

    const sentAfter = await chain!.clients.publicClient.getTransactionCount({ address: chain!.clients.operator.address });
    assert.equal(sentAfter, sentBefore, "test mode sent nothing onchain");

    await t("POST", "/v1/sandbox/reset");
    assert.equal((await t("GET", `/v1/users/${someone}`)).body.balance.credits, "1000");
    assert.equal((await call("GET", "/v1/app", { key: made.body.apiKey })).body.name, "Sandbox App", "the live key still works");
  });
});
