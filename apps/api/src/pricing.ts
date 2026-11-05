/**
 * Company price lists, in credits.
 *
 *   { "chat.message":       { "price": "2" } }                        flat
 *   { "video.render":       { "rate": "8", "unit": "second" } }       per unit, times quantity
 *
 * A price is resolved to units when a job starts and stored with the hold, so it never changes
 * under a running job.
 */
import { z } from "zod";
import { creditsToUnits, unitsToCreditsString } from "./units.js";

const credits = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return unitsToCreditsString(creditsToUnits(v));
  } catch (err) {
    ctx.addIssue({ code: "custom", message: (err as Error).message });
    return z.NEVER;
  }
});

const entry = z.union([
  z.object({ price: credits }).strict(),
  z.object({ rate: credits, unit: z.string().min(1).max(32) }).strict(),
]);

export const priceListSchema = z
  .record(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "action keys are lowercase, like video.render"), entry)
  .refine((p) => Object.keys(p).length <= 200, "at most 200 prices");

export type PriceList = z.infer<typeof priceListSchema>;

/** What to charge: an action from the price list, or an explicit credit amount. */
export const amountInputSchema = z
  .object({
    action: z.string().optional(),
    quantity: z.union([z.string(), z.number()]).optional(),
    credits: z.union([z.string(), z.number()]).optional(),
  })
  .refine((v) => (v.action === undefined) !== (v.credits === undefined), "give exactly one of `action` or `credits`");

export type AmountInput = z.infer<typeof amountInputSchema>;

export class PricingError extends Error {
  override name = "PricingError";
}

/** Resolves an action or credit amount to units, with a human label for activity and CSV. */
export function resolveAmount(input: AmountInput, prices: PriceList): { units: bigint; label: string } {
  if (input.credits !== undefined) {
    const units = parse(input.credits);
    if (units === 0n) throw new PricingError("amount must be more than 0");
    const n = unitsToCreditsString(units);
    return { units, label: `${n} ${n === "1" ? "credit" : "credits"}` };
  }
  const action = input.action!;
  const e = prices[action];
  if (!e) throw new PricingError(`no price set for "${action}"`);

  const qty = input.quantity === undefined ? 1 : Number(input.quantity);
  if (!Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) {
    throw new PricingError("quantity must be a whole number from 1 to 1,000,000");
  }
  const each = parse("price" in e ? e.price : e.rate);
  const units = each * BigInt(qty);
  if (units === 0n) throw new PricingError(`"${action}" is free, nothing to charge`);
  const label = "price" in e ? (qty === 1 ? action : `${action} x${qty}`) : `${action}, ${qty} ${e.unit}`;
  return { units, label };
}

function parse(v: string | number): bigint {
  try {
    return creditsToUnits(v);
  } catch (err) {
    throw new PricingError((err as Error).message);
  }
}
