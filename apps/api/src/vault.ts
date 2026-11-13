/** Typed reads from the Kredo vault and the USDT token. Amounts come back as bigint units. */
import type { AccountId, Chain } from "./near.js";

export type Limit = { remaining: bigint; expiry: number; version: number };
export type OnchainApp = { payout: AccountId; signer: AccountId; feeBps: number; maxCharge: bigint; active: boolean };
export type OnchainHold = { user: AccountId; app: string; amount: bigint; expiry: number; status: "Open" | "Captured" | "Released" };
export type OnchainClaim = { from: AccountId; amount: bigint; expiry: number; status: "Open" | "Claimed" | "Cancelled" };
export type StorageBalance = { total: bigint; available: bigint };
export type Totals ={ balances: bigint; held: bigint; claims: bigint; earnings: bigint; fees: bigint; liabilities: bigint };

type U128 = string;

export function createVault(chain: Chain, vault: AccountId, usdt: AccountId) {
  const v = <T>(method: string, args: Record<string, unknown> = {}) => chain.view<T>(vault, method, args);

  return {
    id: vault,
    usdtId: usdt,

    balanceOf: async (user: AccountId) => BigInt(await v<U128>("balance_of", { user })),

    async limitOf(user: AccountId, app: string): Promise<Limit> {
      const l = await v<{ remaining: U128; expiry: number; version: number }>("limit_of", { user, app });
      return { remaining: BigInt(l.remaining), expiry: Number(l.expiry), version: l.version };
    },

    async getApp(app: string): Promise<OnchainApp | undefined> {
      const a = await v<{ payout: string; signer: string; fee_bps: number; max_charge: U128; active: boolean } | null>("get_app", { app });
      return a ? { payout: a.payout, signer: a.signer, feeBps: a.fee_bps, maxCharge: BigInt(a.max_charge), active: a.active } : undefined;
    },

    earningsOf: async (app: string) => BigInt(await v<U128>("earnings_of", { app })),

    async getHold(holdId: string): Promise<OnchainHold | undefined> {
      const h = await v<{ user: string; app: string; amount: U128; expiry: number; status: OnchainHold["status"] } | null>("get_hold", { hold_id: holdId });
      return h ? { user: h.user, app: h.app, amount: BigInt(h.amount), expiry: Number(h.expiry), status: h.status } : undefined;
    },

    async getClaim(claimKey: string): Promise<OnchainClaim | undefined> {
      const c = await v<{ from: string; amount: U128; expiry: number; status: OnchainClaim["status"] } | null>("get_claim", { claim_key: claimKey });
      return c ? { from: c.from, amount: BigInt(c.amount), expiry: Number(c.expiry), status: c.status } : undefined;
    },

    claimMessage: (claimKey: string, to: AccountId) => v<string>("claim_message", { claim_key: claimKey, to }),

    isOperator: (account: AccountId) => v<boolean>("is_operator", { account }),

    /** An account's NEP-145 storage balance on the vault, in yoctoNEAR. Undefined when not registered. */
    async storageOf(account: AccountId): Promise<StorageBalance | undefined> {
      const s = await v<{ total: U128; available: U128 } | null>("storage_balance_of", { account_id: account });
      return s ? { total: BigInt(s.total), available: BigInt(s.available) } : undefined;
    },

    /** The least a registration costs on the vault, in yoctoNEAR. */
    storageMin: async () => BigInt((await v<{ min: U128 }>("storage_balance_bounds")).min),

    async totals(): Promise<Totals> {
      const t = await v<Record<keyof Totals, U128>>("totals");
      return {
        balances: BigInt(t.balances),
        held: BigInt(t.held),
        claims: BigInt(t.claims),
        earnings: BigInt(t.earnings),
        fees: BigInt(t.fees),
        liabilities: BigInt(t.liabilities),
      };
    },

    /** USDT held by an account, in units. */
    usdtBalanceOf: async (account: AccountId) => BigInt(await chain.view<U128>(usdt, "ft_balance_of", { account_id: account })),

    /** Whether an account is registered with the USDT token (NEP-145), so it can receive USDT. */
    usdtRegistered: async (account: AccountId) => (await chain.view<unknown>(usdt, "storage_balance_of", { account_id: account })) !== null,

    usdtStorageCost: async () => BigInt((await chain.view<{ min: U128 }>(usdt, "storage_balance_bounds")).min),
  };
}

export type Vault = ReturnType<typeof createVault>;
