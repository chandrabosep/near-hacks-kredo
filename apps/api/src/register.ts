/** Registers an app in the vault and in the store. Used by the admin route and the company dashboard. */
import type { Context } from "./context.js";
import type { AccountId, TxHash } from "./near.js";
import type { AppProfileInput } from "./profile.js";
import type { AppRecord } from "./store.js";

export async function registerApp(
  ctx: Context,
  input: { name: string; payout: AccountId; feeBps?: number; maxCharge?: bigint; owner?: string; companyId?: string; profile?: AppProfileInput },
): Promise<{ app: AppRecord; apiKey: string; hash: TxHash }> {
  const feeBps = input.feeBps ?? ctx.config.networkFeeBps;
  const { app, apiKey } = ctx.store.createApp({ name: input.name, payout: input.payout, feeBps, owner: input.owner, companyId: input.companyId, profile: input.profile });
  try {
    const { hash } = await ctx.relayer.write(
      {
        method: "register_app",
        args: { app: app.id, payout: app.payout, fee_bps: feeBps, max_charge: input.maxCharge ? input.maxCharge.toString() : null },
      },
      { app: app.id },
    );
    return { app, apiKey, hash };
  } catch (err) {
    ctx.store.removeApp(app.id);
    throw err;
  }
}
