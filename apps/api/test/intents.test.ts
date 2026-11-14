import assert from "node:assert/strict";
import { test } from "node:test";
import { createIntents, depositMsg, IntentsError, settled } from "../src/intents.js";

type Call = { url: string; method: string; body?: Record<string, unknown>; headers: Record<string, string> };

/** A 1Click stand-in: records each request and answers with `reply`. */
function fake1Click(reply: (call: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: init.headers as Record<string, string>,
    };
    calls.push(call);
    const r = reply(call);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const NOW = Date.parse("2026-11-14T10:00:00Z");
const BASE_USDC = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const ask = {
  originAsset: BASE_USDC,
  units: 5_000_000n,
  user: "alice.near",
  vault: "vault.kredo.near",
  usdt: "usdt.tether-token.near",
  refundTo: "0x1111111111111111111111111111111111111111",
};
const liveQuote = {
  correlationId: "c-1",
  signature: "ed25519:sig",
  quote: { amountIn: "5047839", amountInFormatted: "5.047839", amountOut: "5000000", depositAddress: "0xdeposit", timeEstimate: 35 },
};

test("asks for exactly the credits' USDT, delivered to the vault with the user in the transfer msg", async () => {
  const one = fake1Click(() => ({ json: liveQuote }));
  const intents = createIntents({ fetch: one.fetch, now: () => NOW });

  const q = await intents.quote({ ...ask, dry: false });

  const sent = one.calls[0];
  assert.equal(sent.url, "https://1click.chaindefuser.com/v0/quote");
  assert.equal(sent.method, "POST");
  assert.deepEqual(sent.body, {
    dry: false,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100,
    originAsset: BASE_USDC,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: "nep141:usdt.tether-token.near",
    amount: "5000000",
    recipient: "vault.kredo.near",
    recipientType: "DESTINATION_CHAIN",
    customRecipientMsg: '{"user":"alice.near"}',
    refundTo: ask.refundTo,
    refundType: "ORIGIN_CHAIN",
    deadline: "2026-11-14T10:30:00.000Z",
  });
  assert.equal(q.live, true);
  assert.equal(q.depositAddress, "0xdeposit");
  assert.equal(q.amountInFormatted, "5.047839");
  assert.equal(q.signature, "ed25519:sig", "the quote's signature is kept for disputes");
});

test("the deposit msg is the one the vault's ft_on_transfer reads", () => {
  assert.deepEqual(JSON.parse(depositMsg("bob.near")), { user: "bob.near" });
});

test("a dry quote has a price and no deposit address", async () => {
  const one = fake1Click(() => ({ json: { quote: { ...liveQuote.quote, depositAddress: undefined } } }));
  const q = await createIntents({ fetch: one.fetch, now: () => NOW }).quote({ ...ask, dry: true });
  assert.equal(one.calls[0].body?.dry, true);
  assert.equal(q.live, false);
  assert.equal(q.depositAddress, undefined);
});

test("refuses a quote that would credit less than asked", async () => {
  const one = fake1Click(() => ({ json: { quote: { ...liveQuote.quote, amountOut: "4999999" } } }));
  await assert.rejects(createIntents({ fetch: one.fetch }).quote({ ...ask, dry: false }), (e: IntentsError) => e.code === "short_quote");
});

test("refuses a live quote with nowhere to pay", async () => {
  const one = fake1Click(() => ({ json: { quote: { ...liveQuote.quote, depositAddress: undefined } } }));
  await assert.rejects(createIntents({ fetch: one.fetch }).quote({ ...ask, dry: false }), (e: IntentsError) => e.code === "no_deposit_address");
});

test("passes 1Click's field errors on as a 400, and its outages as a 502", async () => {
  const bad = fake1Click(() => ({ status: 400, json: { message: "refundTo is not valid" } }));
  await assert.rejects(createIntents({ fetch: bad.fetch }).quote({ ...ask, dry: true }), (e: IntentsError) => e.status === 400 && e.message === "refundTo is not valid");

  const down = fake1Click(() => ({ status: 503, json: {} }));
  await assert.rejects(createIntents({ fetch: down.fetch }).quote({ ...ask, dry: true }), (e: IntentsError) => e.status === 502);
});

test("rejects a zero amount without calling 1Click", async () => {
  const one = fake1Click(() => ({ json: liveQuote }));
  await assert.rejects(createIntents({ fetch: one.fetch }).quote({ ...ask, units: 0n, dry: true }), (e: IntentsError) => e.code === "zero_amount");
  assert.equal(one.calls.length, 0);
});

test("sends the JWT when one is set", async () => {
  const one = fake1Click(() => ({ json: liveQuote }));
  await createIntents({ fetch: one.fetch, jwt: "token" }).quote({ ...ask, dry: false });
  assert.equal(one.calls[0].headers.authorization, "Bearer token");
});

test("reads swap status with its NEAR and origin-chain transactions", async () => {
  const one = fake1Click(() => ({
    json: {
      status: "SUCCESS",
      updatedAt: "2026-11-14T10:01:00Z",
      swapDetails: { nearTxHashes: ["Near1", "Near2"], originChainTxHashes: [{ hash: "0xabc", explorerUrl: "x" }], amountOut: "5000000" },
    },
  }));
  const s = await createIntents({ fetch: one.fetch }).status("0xdeposit", "memo-1");
  assert.equal(one.calls[0].url, "https://1click.chaindefuser.com/v0/status?depositAddress=0xdeposit&depositMemo=memo-1");
  assert.deepEqual(s, {
    status: "SUCCESS",
    updatedAt: "2026-11-14T10:01:00Z",
    nearTxHashes: ["Near1", "Near2"],
    originTxHashes: ["0xabc"],
    amountOut: "5000000",
    refundedAmount: undefined,
  });
  assert.equal(settled(s.status), true);
  assert.equal(settled("PROCESSING"), false);
});

test("lists payable tokens stablecoins first, without the vault's own USDT, and caches them", async () => {
  let t = NOW;
  const tokens = [
    { assetId: "nep141:eth.omft.near", symbol: "ETH", blockchain: "eth", decimals: 18, price: 3000 },
    { assetId: "nep141:usdt.tether-token.near", symbol: "USDT", blockchain: "near", decimals: 6, price: 1, contractAddress: "usdt.tether-token.near" },
    { assetId: BASE_USDC, symbol: "USDC", blockchain: "base", decimals: 6, price: 1 },
    { assetId: "nep141:pepe", symbol: "PEPE", blockchain: "eth", decimals: 18, price: 0 },
  ];
  const one = fake1Click(() => ({ json: tokens }));
  const intents = createIntents({ fetch: one.fetch, now: () => t });

  const list = await intents.payable();
  assert.deepEqual(list.map((x) => `${x.symbol}@${x.blockchain}`), ["USDC@base", "ETH@eth"]);

  await intents.payable();
  assert.equal(one.calls.length, 1, "cached within five minutes");
  t += 6 * 60_000;
  await intents.payable();
  assert.equal(one.calls.length, 2, "refetched after");
});
