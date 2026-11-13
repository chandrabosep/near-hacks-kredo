import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { Credits, CreditsNetwork, verifyWebhook, WebhookSignatureError } from "../src/index.js";

const calls: { url: string; method: string; body?: any }[] = [];

/** Answers by path, and records each call. */
const fakeFetch = (async (input: URL | string, init: RequestInit = {}) => {
  const url = new URL(String(input));
  calls.push({ url: url.toString(), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
  const reply = (body: unknown, type = "application/json") =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": type } });
  switch (url.pathname) {
    case "/v1/app":
      return reply({ id: "app-3f9c2a1b", name: "Video Studio" });
    case "/v1/export.csv":
      return reply("date,kind\n2026-11-06,charge\n", "text/csv");
    case "/v1/reserves":
      return reply({ backed: true });
    default:
      return reply({ ok: true });
  }
}) as typeof fetch;

const credits = new Credits({ apiKey: "uc_live_x", baseUrl: "http://api.test", pagesUrl: "https://pay.test/", fetch: fakeFetch });

test("connectUrl looks up the app once and links to the hosted page", async () => {
  calls.length = 0;
  const url = new URL(await credits.connectUrl({ credits: 200, returnTo: "https://video.test/done" }));
  assert.equal(url.origin + url.pathname, "https://pay.test/connect");
  assert.equal(url.searchParams.get("app"), "app-3f9c2a1b");
  assert.equal(url.searchParams.get("credits"), "200");
  assert.equal(url.searchParams.get("returnTo"), "https://video.test/done");

  await credits.connectUrl({ credits: 50 });
  assert.equal(calls.filter((c) => c.url.endsWith("/v1/app")).length, 1, "app id is cached");
  assert.equal(credits.buyUrl({ credits: 500 }), "https://pay.test/buy?credits=500");
  assert.equal(credits.accountUrl(), "https://pay.test/account");
  assert.equal(credits.walletUrl(), "https://pay.test/account", "the old name still works");
});

test("company calls hit the right routes", async () => {
  calls.length = 0;
  await credits.setPrices({ "chat.message": { price: 2 }, "video.render": { rate: 8, unit: "second" } });
  await credits.setProfile({ description: "Renders video.", category: "media" });
  await credits.setExchangeRate("2");
  await credits.convert({ user: "alice.testnet", credits: 10 });
  await credits.payout();
  await credits.activity({ limit: 20 });
  await credits.gas({ since: new Date("2026-11-06T00:00:00Z") });
  await credits.setWebhook("https://video.test/hook");
  const seen = calls.map((c) => `${c.method} ${new URL(c.url).pathname}${new URL(c.url).search}`);
  assert.deepEqual(seen, [
    "PUT /v1/prices",
    "PATCH /v1/profile",
    "PUT /v1/exchange-rate",
    "POST /v1/convert",
    "POST /v1/payout",
    "GET /v1/activity?limit=20",
    "GET /v1/gas?since=2026-11-06T00%3A00%3A00.000Z",
    "PUT /v1/webhook",
  ]);
  assert.deepEqual(calls[0].body.prices["video.render"], { rate: 8, unit: "second" });
  assert.equal(calls[1].body.category, "media");
  assert.ok(calls[3].body.ref, "convert gets a ref too");
});

test("exportCsv returns the CSV text", async () => {
  assert.equal(await credits.exportCsv(), "date,kind\n2026-11-06,charge\n");
});

test("the network client needs no key", async () => {
  const net = new CreditsNetwork({ baseUrl: "http://api.test", fetch: fakeFetch });
  assert.equal((await net.reserves()).backed, true);
});

// ---------------------------------------------------------------- webhooks

const secret = "whsec_test";
const body = JSON.stringify({ id: "6i6ZaUXg:1", type: "charge.succeeded", createdAt: "2026-11-06T00:00:00.000Z", data: { ref: "job-1" } });
const sign = (t: number, b = body, s = secret) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;
const now = 1_793_900_000;

test("a correctly signed webhook verifies and parses", () => {
  const event = verifyWebhook(body, sign(now), secret, { now });
  assert.equal(event.type, "charge.succeeded");
  assert.equal(event.data.ref, "job-1");
  assert.equal(verifyWebhook(Buffer.from(body), sign(now), secret, { now }).id, "6i6ZaUXg:1", "raw Buffer bodies work");
});

test("a tampered body, wrong secret, old timestamp or missing header is rejected", () => {
  const bad = (fn: () => unknown, msg: RegExp) => assert.throws(fn, (e: unknown) => e instanceof WebhookSignatureError && msg.test(e.message));
  bad(() => verifyWebhook(body.replace("job-1", "job-2"), sign(now), secret, { now }), /doesn't match/);
  bad(() => verifyWebhook(body, sign(now, body, "whsec_other"), secret, { now }), /doesn't match/);
  bad(() => verifyWebhook(body, sign(now - 301), secret, { now }), /too old/);
  bad(() => verifyWebhook(body, undefined, secret, { now }), /Missing/);
  bad(() => verifyWebhook(body, "v1=abc", secret, { now }), /Malformed/);
});
