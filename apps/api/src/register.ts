/** Registers an app onchain and in the store. Used by the admin route and the company dashboard. */
import type { Address } from "viem";
import { creditVaultAbi } from "./abi/CreditVault.js";
import type { Context } from "./context.js";
import type { AppRecord } from "./store.js";

export async function registerApp(
  ctx: Context,
  input: { name: string; payout: Address; feeBps?: number; maxCharge?: bigint; owner?: string },
): Promise<{ app: AppRecord; apiKey: string; hash: `0x${string}` }> {
  const feeBps = input.feeBps ?? ctx.config.networkFeeBps;
  const { app, apiKey } = ctx.store.createApp({ name: input.name, payout: input.payout, feeBps, owner: input.owner });
  try {
    const { hash } = await ctx.relayer.write(
      {
        address: ctx.config.vault,
        abi: creditVaultAbi,
        functionName: "registerApp",
        args: [app.id, app.payout, feeBps, input.maxCharge ?? 0n],
      },
      { app: app.id },
    );
    return { app, apiKey, hash };
  } catch (err) {
    ctx.store.removeApp(app.id);
    throw err;
  }
}
