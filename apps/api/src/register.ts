/** Registers an app in the vault and in the store. Used by the admin route and the company dashboard. */
import type { Context } from "./context.js";
import { HttpError } from "./http.js";
import type { AccountId, TxHash } from "./near.js";
import type { AppProfileInput } from "./profile.js";
import type { AppRecord } from "./store.js";

export async function registerApp(
  ctx: Context,
  input: {
    name: string;
    payout: AccountId;
    /** The account that signs this app's charges. Defaults to `<app id>.<apps parent>`. */
    signer?: AccountId;
    feeBps?: number;
    maxCharge?: bigint;
    owner?: string;
    companyId?: string;
    profile?: AppProfileInput;
  },
): Promise<{ app: AppRecord; apiKey: string; signer: AccountId; hash: TxHash }> {
  const feeBps = input.feeBps ?? ctx.config.networkFeeBps;
  if (!input.signer && !ctx.config.appsParent) {
    throw new HttpError(400, "Pass the app's signer account, or set APPS_PARENT_ACCOUNT_ID", "signer_required");
  }
  const { app, apiKey } = ctx.store.createApp({ name: input.name, payout: input.payout, feeBps, owner: input.owner, companyId: input.companyId, profile: input.profile });
  const signer = input.signer ?? `${app.id}.${ctx.config.appsParent}`;
  try {
    // The vault takes the new app's state from the caller's storage balance: here, the relayer's.
    await ctx.storage.ensureHeadroom(ctx.relayer.operator);
    const { hash } = await ctx.relayer.write(
      {
        method: "register_app",
        args: { app: app.id, payout: app.payout, signer, fee_bps: feeBps, max_charge: input.maxCharge ? input.maxCharge.toString() : null },
      },
      { app: app.id },
    );
    // Only once the app exists: the app's charges take their state from its signer's storage balance,
    // funded once here. Funding first would strand the NEAR if registration failed, since the vault
    // never gives storage back.
    await ctx.storage.fundSigner(signer, ctx.config.appSignerStorageYocto);
    return { app, apiKey, signer, hash };
  } catch (err) {
    ctx.store.removeApp(app.id);
    throw err;
  }
}
