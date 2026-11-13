import assert from "node:assert/strict";
import { test } from "node:test";
import { Credits, CreditsError } from "../src/index.js";

type Seen = { url: URL; method: string; headers: Record<string, string>; body?: any };

/** A fake API: answers each call with the next scripted response, and records what was sent. */
function fakeApi(responses: (Response | Error)[]) {
  const seen: Seen[] = [];
  const fetch = (async (input: URL | string, init: RequestInit = {}) => {
    seen.push({
      url: new URL(String(input)),
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error("no more scripted responses");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof globalThis.fetch;
  return { seen, fetch };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const client = (fetch: typeof globalThis.fetch) =>
  new Credits({ apiKey: "uc_live_test", baseUrl: "http://api.test/", fetch });

test("sends the API key and builds the quote query", async () => {
  const api = fakeApi([json(200, { label: "12 seconds", price: {}, networkFee: {}, youEarn: {} })]);
  await client(api.fetch).quote({ action: "video.render", quantity: 12 });
  const [call] = api.seen;
  assert.equal(call.url.toString(), "http://api.test/v1/quote?action=video.render&quantity=12");
  assert.equal(call.headers.authorization, "Bearer uc_live_test");
});

test("a charge without a ref gets one, and keeps it across a retry", async () => {
  const api = fakeApi([new TypeError("socket hang up"), json(201, { kind: "charge" })]);
  await client(api.fetch).charge({ user: "alice.testnet", credits: 2 });
  assert.equal(api.seen.length, 2);
  const [first, second] = api.seen;
  assert.match(first.body.ref, /^[0-9a-f-]{36}$/);
  assert.equal(second.body.ref, first.body.ref, "same ref, so the API can't charge twice");
  assert.equal(first.body.credits, 2);
});

test("your own ref is sent as is", async () => {
  const api = fakeApi([json(201, { kind: "hold", holdId: "9f2c01" })]);
  await client(api.fetch).hold({ user: "alice.testnet", action: "video.render", quantity: 3, ref: "job-42", ttlSeconds: 600 });
  assert.deepEqual(api.seen[0].body, { user: "alice.testnet", action: "video.render", quantity: 3, ref: "job-42", ttlSeconds: 600 });
});

test("a rate limit is waited out, then retried", async () => {
  const api = fakeApi([json(429, { error: "Too many requests", code: "rate_limited" }, { "retry-after": "0" }), json(201, {})]);
  await client(api.fetch).refund({ user: "alice.testnet", credits: "1.5" });
  assert.equal(api.seen.length, 2);
});

test("a contract refusal is a declined CreditsError and isn't retried", async () => {
  const api = fakeApi([json(422, { error: "The user hasn't approved this app for that much.", code: "OverLimit" })]);
  const err = await client(api.fetch).charge({ user: "alice.testnet", credits: 1000 }).catch((e) => e);
  assert.ok(err instanceof CreditsError);
  assert.equal(err.status, 422);
  assert.equal(err.code, "OverLimit");
  assert.equal(err.isDeclined, true);
  assert.equal(err.isRetryable, false);
  assert.equal(api.seen.length, 1);
});

test("a paused relayer is retryable, not declined", async () => {
  const api = fakeApi([json(503, { error: "The network has hit its daily gas budget.", code: "DailyBudgetReached" })]);
  const err = await client(api.fetch).charge({ user: "alice.testnet", credits: 1 }).catch((e) => e);
  assert.equal(err.code, "DailyBudgetReached");
  assert.equal(err.isRetryable, true);
  assert.equal(err.isDeclined, false);
});

test("gives up after the configured retries with a network error", async () => {
  const api = fakeApi([new TypeError("down"), new TypeError("down")]);
  const credits = new Credits({ apiKey: "k", baseUrl: "http://api.test", fetch: api.fetch, retries: 1 });
  const err = await credits.release("9f2c01").catch((e) => e);
  assert.ok(err instanceof CreditsError);
  assert.equal(err.status, 0);
  assert.equal(err.code, "network");
  assert.equal(api.seen.length, 2);
});

test("capture sends a partial amount; holdIds are path-escaped", async () => {
  const api = fakeApi([json(200, { kind: "capture", returned: {} })]);
  await client(api.fetch).capture("9f/2c", { credits: 3 });
  assert.equal(api.seen[0].url.pathname, "/v1/holds/9f%2F2c/capture");
  assert.deepEqual(api.seen[0].body, { credits: 3 });
});

test("an API key is required", () => {
  assert.throws(() => new Credits({ apiKey: "" }), /apiKey/);
});
