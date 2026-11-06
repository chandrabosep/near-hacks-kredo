import assert from "node:assert/strict";
import { test } from "node:test";
import { priceListSchema, PricingError, resolveAmount } from "../src/pricing.js";
import { amount, creditsToUnits, unitsToCreditsString, unitsToUsdString } from "../src/units.js";

test("credits convert to units exactly", () => {
  assert.equal(creditsToUnits("40"), 400_000n);
  assert.equal(creditsToUnits(40), 400_000n);
  assert.equal(creditsToUnits("0.1"), 1_000n);
  assert.equal(creditsToUnits(0.1), 1_000n, "no float drift");
  assert.equal(creditsToUnits("12.2500"), 122_500n);
  assert.equal(creditsToUnits("0.0001"), 1n);
  assert.equal(creditsToUnits("0"), 0n);
});

test("rejects amounts finer than one unit, negative or malformed", () => {
  assert.throws(() => creditsToUnits("0.00001"), /finer than/);
  assert.throws(() => creditsToUnits(-1), RangeError);
  assert.throws(() => creditsToUnits("1e3"), RangeError);
  assert.throws(() => creditsToUnits("abc"), RangeError);
  assert.throws(() => creditsToUnits(Number.NaN), RangeError);
});

test("units display as exact credits and dollars", () => {
  assert.equal(unitsToCreditsString(400_000n), "40");
  assert.equal(unitsToCreditsString(5n), "0.0005");
  assert.equal(unitsToUsdString(400_000n), "0.4");
  assert.equal(unitsToUsdString(10_000_000n), "10");
  assert.deepEqual(amount(380_000n), { units: "380000", credits: "38", usd: "0.38" });
});

test("price lists normalise credit values and reject bad keys", () => {
  const p = priceListSchema.parse({ "chat.message": { price: 2 }, "video.render": { rate: "8.50", unit: "second" } });
  assert.deepEqual(p, { "chat.message": { price: "2" }, "video.render": { rate: "8.5", unit: "second" } });
  assert.equal(priceListSchema.safeParse({ "Bad Key": { price: 1 } }).success, false);
  assert.equal(priceListSchema.safeParse({ x: { price: "0.00001" } }).success, false);
  assert.equal(priceListSchema.safeParse({ x: { price: 1, extra: true } }).success, false);
});

test("resolves flat, per-unit and explicit amounts", () => {
  const prices = priceListSchema.parse({ "chat.message": { price: "2" }, "video.render": { rate: "8", unit: "second" } });
  assert.deepEqual(resolveAmount({ action: "chat.message" }, prices), { units: 20_000n, label: "chat.message" });
  assert.deepEqual(resolveAmount({ action: "chat.message", quantity: 3 }, prices), {
    units: 60_000n,
    label: "chat.message x3",
  });
  assert.deepEqual(resolveAmount({ action: "video.render", quantity: "5" }, prices), {
    units: 400_000n,
    label: "video.render, 5 seconds",
  });
  assert.deepEqual(resolveAmount({ credits: "1.5" }, prices), { units: 15_000n, label: "1.5 credits" });
});

test("explains pricing mistakes", () => {
  const prices = priceListSchema.parse({ free: { price: 0 } });
  assert.throws(() => resolveAmount({ action: "missing" }, prices), PricingError);
  assert.throws(() => resolveAmount({ action: "free" }, prices), /free/);
  assert.throws(() => resolveAmount({ action: "free", quantity: 1.5 }, prices), /whole number/);
  assert.throws(() => resolveAmount({ credits: 0 }, prices), /more than 0/);
});
