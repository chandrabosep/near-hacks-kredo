import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { actions as nearActions, buildDelegateAction, encodeDelegateAction, KeyPair, PublicKey } from "near-api-js";
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

// --- app-signed writes ------------------------------------------------------

/** A throwaway test key, generated with near-api-js. Its public key, as raw hex: */
const SIGNER_KEY = "ed25519:fXW1VAn6Qi468uphQZTphNGgfWh7Rpf1FBGYvA8QuSAsyPkXhbr6zeFe8iLQMTRpDMmUHi8RDxmLTxrFrB9y4Vi";
const SIGNER_PUBLIC_HEX = "d0b98fe5bfa6694a05cc9fb97bc9cddc2947339d4dc42b1ae3ee9c1101c8d3ad";

function verifyEd25519(publicHex: string, message: Buffer, signature: Buffer): boolean {
  // DER prefix for a raw ed25519 public key (SubjectPublicKeyInfo).
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicHex, "hex")]);
  const key = createPublicKey({ key: spki, format: "der", type: "spki" });
  return cryptoVerify(null, message, key, signature);
}

/** What the API sends back with a 428: a delegate action from the app's signer, and its hash. Built with near-api-js. */
function prepared(method: string, args: Record<string, unknown>, opts: { publicKey?: string } = {}) {
  const delegate = buildDelegateAction({
    senderId: "app-0123456789abcdef.apps.kredo.test",
    receiverId: "vault.kredo.test",
    actions: [nearActions.functionCall(method, args, 50_000_000_000_000n, 0n)],
    nonce: 7n,
    maxBlockHeight: 1_000n,
    publicKey: PublicKey.from(opts.publicKey ?? "ed25519:F3muxzTEDpteY3encsiNPMF8ZrgYE1Kg6adUeCaAbMvU"),
  });
  const bytes = Buffer.from(encodeDelegateAction(delegate));
  return { hash: `0x${createHash("sha256").update(bytes).digest("hex")}`, delegate: bytes.toString("base64") };
}

const refOf = (kind: string, ref: string) => createHash("sha256").update(`${kind}:${ref}`).digest("hex");
const signing = (fetch: typeof globalThis.fetch) =>
  new Credits({ apiKey: "uc_live_test", baseUrl: "http://api.test/", fetch, signerKey: SIGNER_KEY });

test("a write the API asks to have signed is checked, signed with the app's key and sent again with the same ref", async () => {
  const p = prepared("charge", { user: "alice.testnet", app: "app-0123456789abcdef", amount: "20000", ref_id: refOf("charge", "msg-1") });
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...p }), json(201, { kind: "charge" })]);
  await signing(api.fetch).charge({ user: "alice.testnet", credits: 2, ref: "msg-1" });

  assert.equal(api.seen.length, 2);
  const [first, second] = api.seen;
  assert.equal(first.headers["x-kredo-signature"], undefined);
  assert.equal(first.headers["x-kredo-signer-key"], "ed25519:F3muxzTEDpteY3encsiNPMF8ZrgYE1Kg6adUeCaAbMvU", "the key's public half, so the API can prepare the transaction");
  assert.deepEqual(second.body, first.body, "same body and ref, so the API matches it to what it prepared");
  const [signedHash, sigHex] = second.headers["x-kredo-signature"].split(":");
  assert.equal(signedHash, p.hash);
  assert.ok(verifyEd25519(SIGNER_PUBLIC_HEX, Buffer.from(p.hash.slice(2), "hex"), Buffer.from(sigHex, "hex")), "signed by the app's key");
});

test("the SDK won't sign a charge for a different user than it asked for", async () => {
  const p = prepared("charge", { user: "mallory.testnet", app: "app-0123456789abcdef", amount: "20000", ref_id: refOf("charge", "msg-1") });
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...p })]);
  await assert.rejects(signing(api.fetch).charge({ user: "alice.testnet", credits: 2, ref: "msg-1" }), (e: CreditsError) => e.code === "signature_mismatch");
  assert.equal(api.seen.length, 1, "nothing signed, nothing sent back");
});

test("the SDK won't sign a bigger amount than it asked for", async () => {
  const p = prepared("charge", { user: "alice.testnet", app: "app-0123456789abcdef", amount: "990000", ref_id: refOf("charge", "msg-1") });
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...p })]);
  await assert.rejects(signing(api.fetch).charge({ user: "alice.testnet", credits: 2, ref: "msg-1" }), (e: CreditsError) => e.code === "signature_mismatch");
});

test("the SDK won't sign a different method than the request", async () => {
  const p = prepared("refund", { user: "alice.testnet", app: "app-0123456789abcdef", amount: "20000", ref_id: refOf("charge", "msg-1") });
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...p })]);
  await assert.rejects(signing(api.fetch).charge({ user: "alice.testnet", credits: 2, ref: "msg-1" }), (e: CreditsError) => e.code === "signature_mismatch");
});

test("the SDK won't sign a hash that isn't the hash of the bytes it was shown", async () => {
  const p = prepared("charge", { user: "alice.testnet", app: "app-0123456789abcdef", amount: "20000", ref_id: refOf("charge", "msg-1") });
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...p, hash: "0x" + "ab".repeat(32) })]);
  await assert.rejects(signing(api.fetch).charge({ user: "alice.testnet", credits: 2, ref: "msg-1" }), (e: CreditsError) => e.code === "signature_mismatch");
});

test("the SDK won't sign for a key that isn't its own", async () => {
  const other = KeyPair.fromRandom("ed25519").getPublicKey().toString();
  const p = prepared("charge", { user: "alice.testnet", app: "app-0123456789abcdef", amount: "20000", ref_id: refOf("charge", "msg-1") }, { publicKey: other });
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...p })]);
  await assert.rejects(signing(api.fetch).charge({ user: "alice.testnet", credits: 2, ref: "msg-1" }), (e: CreditsError) => e.code === "signature_mismatch");
});

test("a capture is signed only for its own hold and amount", async () => {
  const ok = prepared("capture", { hold_id: "9f2c01", actual: "400000" });
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...ok }), json(200, { kind: "capture" })]);
  await signing(api.fetch).capture("9f2c01", { credits: 40 });
  assert.equal(api.seen.length, 2);

  const wrongHold = prepared("capture", { hold_id: "other", actual: "400000" });
  const api2 = fakeApi([json(428, { error: "Sign this", code: "signature_required", ...wrongHold })]);
  await assert.rejects(signing(api2.fetch).capture("9f2c01", { credits: 40 }), (e: CreditsError) => e.code === "signature_mismatch");
});

test("without a signer key, a write the API wants signed fails clearly", async () => {
  const api = fakeApi([json(428, { error: "Sign this", code: "signature_required", hash: "0x" + "ab".repeat(32) })]);
  await assert.rejects(client(api.fetch).charge({ user: "alice.testnet", credits: 2 }), (e: CreditsError) => e.code === "missing_signer");
});
