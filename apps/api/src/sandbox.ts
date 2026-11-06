/**
 * Test mode: the vault's rules, in memory, with fake credits.
 *
 * A test API key (`uc_test_...`) runs the same calls as a live key against this sandbox instead
 * of the chain. Every user starts with 1,000 test credits and a 500 credit limit for the app, so
 * a developer can build and test an integration before anyone holds USDT. Nothing here touches
 * the chain, and nothing here is ever real money.
 */
import type { Address, Hex } from "viem";
import { keccak256, stringToHex } from "viem";
import { RelayerError } from "./relayer.js";
import { UNITS_PER_CREDIT } from "./units.js";

export const TEST_START_BALANCE = 1_000n * UNITS_PER_CREDIT;
export const TEST_START_LIMIT = 500n * UNITS_PER_CREDIT;

type Hold = { user: Address; units: bigint; expiry: number; status: "open" | "captured" | "released" };

type AppSandbox = {
  balances: Map<string, bigint>;
  limits: Map<string, bigint>;
  spent: Map<string, bigint>;
  holds: Map<string, Hold>;
  refs: Set<string>;
  earnings: bigint;
  txs: number;
};

const key = (a: string) => a.toLowerCase();

export function createSandbox() {
  const apps = new Map<string, AppSandbox>();

  function of(app: Address): AppSandbox {
    let s = apps.get(key(app));
    if (!s) {
      s = { balances: new Map(), limits: new Map(), spent: new Map(), holds: new Map(), refs: new Set(), earnings: 0n, txs: 0 };
      apps.set(key(app), s);
    }
    return s;
  }

  const balance = (s: AppSandbox, user: Address) => s.balances.get(key(user)) ?? TEST_START_BALANCE;
  const limit = (s: AppSandbox, user: Address) => s.limits.get(key(user)) ?? TEST_START_LIMIT;

  /** A fake but unique "transaction hash", so responses keep their live shape. */
  const txHash = (s: AppSandbox, app: Address): Hex => keccak256(stringToHex(`test:${app}:${++s.txs}`));

  function useRef(s: AppSandbox, ref: Hex) {
    if (s.refs.has(ref)) throw new RelayerError("RefUsed");
    s.refs.add(ref);
  }

  function debit(s: AppSandbox, user: Address, units: bigint) {
    if (units === 0n) throw new RelayerError("ZeroAmount");
    if (units > limit(s, user)) throw new RelayerError("OverLimit");
    if (units > balance(s, user)) throw new RelayerError("InsufficientBalance");
    s.limits.set(key(user), limit(s, user) - units);
    s.balances.set(key(user), balance(s, user) - units);
  }

  function earn(s: AppSandbox, user: Address, units: bigint, feeBps: number) {
    const fee = (units * BigInt(feeBps)) / 10_000n;
    s.spent.set(key(user), (s.spent.get(key(user)) ?? 0n) + units);
    s.earnings += units - fee;
    return fee;
  }

  return {
    user(app: Address, user: Address) {
      const s = of(app);
      return { balance: balance(s, user), limit: limit(s, user) };
    },

    charge(app: Address, user: Address, units: bigint, ref: Hex, feeBps: number) {
      const s = of(app);
      useRef(s, ref);
      debit(s, user, units);
      return { fee: earn(s, user, units, feeBps), hash: txHash(s, app) };
    },

    hold(app: Address, user: Address, units: bigint, ref: Hex, expiry: number) {
      const s = of(app);
      useRef(s, ref);
      debit(s, user, units);
      const holdId = keccak256(stringToHex(`hold:${app}:${ref}`));
      s.holds.set(holdId, { user, units, expiry, status: "open" });
      return { holdId, hash: txHash(s, app) };
    },

    getHold(app: Address, holdId: string) {
      return of(app).holds.get(holdId);
    },

    capture(app: Address, holdId: string, actual: bigint, feeBps: number) {
      const s = of(app);
      const h = s.holds.get(holdId);
      if (!h || h.status !== "open") throw new RelayerError("HoldNotOpen");
      if (h.expiry <= Math.floor(Date.now() / 1000)) throw new RelayerError("HoldExpired");
      if (actual > h.units) throw new RelayerError("OverHeld");
      const returned = h.units - actual;
      h.status = "captured";
      // The unused part goes back to both the balance and the limit, as the vault does.
      s.balances.set(key(h.user), balance(s, h.user) + returned);
      s.limits.set(key(h.user), limit(s, h.user) + returned);
      return { fee: earn(s, h.user, actual, feeBps), returned, hash: txHash(s, app) };
    },

    release(app: Address, holdId: string) {
      const s = of(app);
      const h = s.holds.get(holdId);
      if (!h || h.status !== "open") throw new RelayerError("HoldNotOpen");
      h.status = "released";
      s.balances.set(key(h.user), balance(s, h.user) + h.units);
      s.limits.set(key(h.user), limit(s, h.user) + h.units);
      return { hash: txHash(s, app) };
    },

    refund(app: Address, user: Address, units: bigint, ref: Hex) {
      const s = of(app);
      useRef(s, ref);
      if (units > (s.spent.get(key(user)) ?? 0n)) throw new RelayerError("OverSpent");
      if (units > s.earnings) throw new RelayerError("InsufficientEarnings");
      s.spent.set(key(user), (s.spent.get(key(user)) ?? 0n) - units);
      s.earnings -= units;
      s.balances.set(key(user), balance(s, user) + units);
      return { hash: txHash(s, app) };
    },

    earnings: (app: Address) => of(app).earnings,

    /** Wipes one app's sandbox, back to fresh test users. */
    reset(app: Address) {
      apps.delete(key(app));
    },
  };
}

export type Sandbox = ReturnType<typeof createSandbox>;
