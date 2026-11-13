/**
 * An in-memory NEAR chain for API tests: accounts and access keys, signed delegate actions
 * (NEP-366) checked like the runtime checks them, the test USDT token (NEP-141 with storage
 * registration) and the Kredo vault, ported rule for rule from contracts/vault/src/lib.rs, with its
 * NEP-145 storage priced per entry rather than per measured byte.
 *
 * Each receipt is atomic, as on NEAR: a panic rolls back that receipt's changes, and a deposit
 * the vault turns down is refunded by the token. The vault's own behaviour is tested in Rust;
 * this exists so the API can be tested end to end without a node.
 */
import { createHash } from "node:crypto";
import { encodeDelegateAction, KeyPair, PublicKey, type KeyPairString } from "near-api-js";
import type { AccountId, Chain, ChainEvent, Outcome, TxAction } from "../src/near.js";

const UNITS_PER_CREDIT = 10_000n;
const MAX_FEE_BPS = 2_000;
const MAX_HOLD_SECONDS = 86_400;
const STORAGE_COST = 1_250_000_000_000_000_000_000n;
const GAS_PRICE = 100_000_000n;
const GAS_PER_RECEIPT = 2_500_000_000_000n;
// Vault storage (NEP-145): yoctoNEAR per byte, and roughly what each kind of entry takes.
const BYTE_COST = 10_000_000_000_000_000_000n;
const ACCOUNT_BYTES = 250n;
const LIMIT_BYTES = 150n;
const CLAIM_BYTES = 200n;
const APP_BYTES = 200n;

class Panic extends Error {}
const require = (ok: boolean, msg: string): void => {
  if (!ok) throw new Panic(msg);
};

type App = { payout: string; fee_bps: number; max_charge: bigint; active: boolean };
type Limit = { remaining: bigint; expiry: number; version: number };
type Hold = { user: string; app: string; amount: bigint; expiry: number; limit_version: number; status: "Open" | "Captured" | "Released" };
type Claim = { from: string; amount: bigint; expiry: number; status: "Open" | "Claimed" | "Cancelled" };

function emptyState(owner: string, operator: string) {
  return {
    accounts: new Map<string, { balance: bigint; keys: Map<string, bigint> }>(),
    usdt: { balances: new Map<string, bigint>(), registered: new Set<string>() },
    vault: {
      owner,
      operators: new Set([operator]),
      paused: false,
      apps: new Map<string, App>(),
      balances: new Map<string, bigint>(),
      limits: new Map<string, Limit>(),
      holds: new Map<string, Hold>(),
      claims: new Map<string, Claim>(),
      earnings: new Map<string, bigint>(),
      spent: new Map<string, bigint>(),
      refs: new Set<string>(),
      /** NEP-145 storage balances, in yoctoNEAR. */
      storage: new Map<string, { total: bigint; available: bigint }>(),
      totals: { balances: 0n, held: 0n, claims: 0n, earnings: 0n, fees: 0n },
    },
  };
}
type State = ReturnType<typeof emptyState>;

const clone = (s: State): State => structuredClone(s);
const pair = (a: string, b: string) => `${a}\u0000${b}`;
const big = (v: unknown) => BigInt(String(v));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

export type FakeChain = Chain & {
  vault: AccountId;
  usdt: AccountId;
  /** Moves the chain's clock forward, in seconds. */
  advance(seconds: number): void;
  /** Mints test USDT to an account, registering it first. */
  mint(account: AccountId, units: bigint): void;
  /** Every transaction sent, newest last. */
  sent: Outcome[];
};

export function createFakeChain(opts: { relayer?: string; vault?: string; usdt?: string; owner?: string } = {}): FakeChain {
  const relayerId = opts.relayer ?? "relayer.kredo.test";
  const vaultId = opts.vault ?? "vault.kredo.test";
  const usdtId = opts.usdt ?? "usdt.kredo.test";
  const owner = opts.owner ?? "kredo.test";
  let state = emptyState(owner, relayerId);
  let height = 1_000;
  let offsetMs = 0;
  const now = () => Date.now() + offsetMs;
  const nowSec = () => Math.floor(now() / 1000);
  const sent: Outcome[] = [];

  state.accounts.set(relayerId, { balance: 10n * 10n ** 24n, keys: new Map() });
  state.accounts.set(owner, { balance: 10n * 10n ** 24n, keys: new Map() });
  // The vault and the relayer hold USDT, so both are registered with the token at deploy.
  state.usdt.registered.add(vaultId).add(relayerId);

  // ---------------------------------------------------------------- receipts

  type Ctx = { events: ChainEvent[]; failure?: string; receipts: number };

  /** Runs one receipt atomically. Returns its value, or undefined if it panicked. */
  function receipt<T>(c: Ctx, executor: string, run: (emit: (event: string, data: Record<string, unknown>) => void) => T): { ok: boolean; value?: T } {
    c.receipts++;
    const before = clone(state);
    const local: ChainEvent[] = [];
    const emit = (event: string, data: Record<string, unknown>) =>
      local.push({ standard: executor === usdtId ? "nep141" : "kredo", event, data: JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))), executor, index: 0 });
    try {
      const value = run(emit);
      for (const e of local) c.events.push({ ...e, index: c.events.length });
      return { ok: true, value };
    } catch (err) {
      state = before;
      if (!(err instanceof Panic)) throw err;
      c.failure ??= err.message;
      return { ok: false };
    }
  }

  // ---------------------------------------------------------------- usdt

  function usdtCall(c: Ctx, caller: string, method: string, a: Record<string, unknown>, deposit: bigint): void {
    const u = state.usdt;
    const bal = (id: string) => u.balances.get(id) ?? 0n;
    const transfer = (from: string, to: string, amount: bigint) => {
      require(u.registered.has(to), `The account ${to} is not registered`);
      require(bal(from) >= amount, "The account doesn't have enough balance");
      require(from !== to, "Sender and receiver should be different");
      u.balances.set(from, bal(from) - amount);
      u.balances.set(to, bal(to) + amount);
    };
    switch (method) {
      case "storage_deposit":
        receipt(c, usdtId, () => {
          require(deposit >= STORAGE_COST, "The attached deposit is less than the minimum storage balance");
          u.registered.add(String(a.account_id ?? caller));
        });
        return;
      case "ft_transfer":
        receipt(c, usdtId, (emit) => {
          require(deposit === 1n, "Requires attached deposit of exactly 1 yoctoNEAR");
          transfer(caller, String(a.receiver_id), big(a.amount));
          emit("ft_transfer", { old_owner_id: caller, new_owner_id: a.receiver_id, amount: String(a.amount) });
        });
        return;
      case "ft_transfer_call": {
        const amount = big(a.amount);
        const to = String(a.receiver_id);
        const moved = receipt(c, usdtId, () => {
          require(deposit === 1n, "Requires attached deposit of exactly 1 yoctoNEAR");
          transfer(caller, to, amount);
        });
        if (!moved.ok) return;
        // The receiver's ft_on_transfer, then ft_resolve_transfer refunds what it returned.
        let unused = amount;
        if (to === vaultId) {
          const r = receipt(c, vaultId, (emit) => vaultOnTransfer(caller, amount, String(a.msg ?? ""), emit));
          unused = r.ok ? r.value! : amount;
        }
        if (unused > 0n) receipt(c, usdtId, () => transfer(to, caller, unused));
        return;
      }
      default:
        receipt(c, usdtId, () => require(false, `Method ${method} not found`));
    }
  }

  // ---------------------------------------------------------------- vault

  const v = () => state.vault;
  const onlyOperator = (caller: string) => require(v().operators.has(caller), "Not operator");
  const notPaused = () => require(!v().paused, "Paused");
  const activeApp = (app: string) => {
    const a = v().apps.get(app);
    require(!!a, "Unknown app");
    require(a!.active, "App inactive");
    return a!;
  };
  const addBalance = (user: string, amount: bigint) => v().balances.set(user, (v().balances.get(user) ?? 0n) + amount);
  const debit = (user: string, amount: bigint) => {
    const bal = v().balances.get(user) ?? 0n;
    require(amount <= bal, "Insufficient balance");
    v().balances.set(user, bal - amount);
  };
  const useRef = (app: string, ref: string) => {
    require(ref.length > 0 && ref.length <= 128, "Bad ref");
    require(!v().refs.has(pair(app, ref)), "Ref used");
    v().refs.add(pair(app, ref));
  };
  const consumeLimit = (user: string, app: string, amount: bigint) => {
    require(amount > 0n, "Zero amount");
    const a = activeApp(app);
    require(a.max_charge === 0n || amount <= a.max_charge, "Over max charge");
    const l = v().limits.get(pair(user, app));
    require(!!l, "Over limit");
    require(l!.expiry === 0 || nowSec() < l!.expiry, "Limit expired");
    require(amount <= l!.remaining, "Over limit");
    l!.remaining -= amount;
  };
  const earn = (user: string, app: string, amount: bigint) => {
    v().spent.set(pair(user, app), (v().spent.get(pair(user, app)) ?? 0n) + amount);
    const fee = (amount * BigInt(v().apps.get(app)?.fee_bps ?? 0)) / 10_000n;
    v().earnings.set(app, (v().earnings.get(app) ?? 0n) + amount - fee);
    v().totals.earnings += amount - fee;
    v().totals.fees += fee;
    return fee;
  };
  const returnToUser = (h: Hold, amount: bigint) => {
    addBalance(h.user, amount);
    v().totals.balances += amount;
    const l = v().limits.get(pair(h.user, h.app));
    if (l && l.version === h.limit_version) l.remaining += amount;
  };
  /** Takes the state a call added from `payer`'s storage balance, as the vault's pay_storage does. */
  const payStorage = (payer: string, bytes: bigint) => {
    const d = v().storage.get(payer);
    require(!!d, "Not registered");
    const cost = bytes * BYTE_COST;
    require(d!.available >= cost, "Insufficient storage");
    d!.available -= cost;
  };
  const claimMessage = (claimKey: string, to: string) => `kredo-claim:${vaultId}:${claimKey}:${to}`;

  function vaultOnTransfer(sender: string, amount: bigint, msg: string, emit: (e: string, d: Record<string, unknown>) => void): bigint {
    if (v().paused) return amount;
    let user = sender;
    if (msg.trim()) {
      try {
        user = (JSON.parse(msg) as { user?: string }).user ?? sender;
      } catch {
        require(false, "Bad msg");
      }
    }
    require(amount >= UNITS_PER_CREDIT, "Below minimum deposit");
    if (!v().storage.has(user)) {
      emit("deposit_refunded", { user, payer: sender, amount, reason: "not_registered" });
      return amount;
    }
    addBalance(user, amount);
    v().totals.balances += amount;
    emit("deposited", { user, payer: sender, amount });
    return 0n;
  }

  function vaultCall(c: Ctx, caller: string, method: string, a: Record<string, unknown>, deposit: bigint): void {
    if (method === "payout") return payout(c, caller, String(a.app));
    receipt(c, vaultId, (emit) => {
      switch (method) {
        case "register_app": {
          require(caller === v().owner || v().operators.has(caller), "Not owner or operator");
          const app = String(a.app);
          require(/^[A-Za-z0-9_-]{1,64}$/.test(app), "Bad app id");
          require(!v().apps.has(app), "App exists");
          require(Number(a.fee_bps) <= MAX_FEE_BPS, "Fee too high");
          const maxCharge = a.max_charge == null ? 0n : big(a.max_charge);
          v().apps.set(app, { payout: String(a.payout), fee_bps: Number(a.fee_bps), max_charge: maxCharge, active: true });
          payStorage(caller, APP_BYTES);
          emit("app_registered", { app, payout: a.payout, fee_bps: a.fee_bps, max_charge: maxCharge });
          return;
        }
        case "set_app_active": {
          require(caller === v().owner || v().operators.has(caller), "Not owner or operator");
          const app = v().apps.get(String(a.app));
          require(!!app, "Unknown app");
          app!.active = Boolean(a.active);
          emit("app_active_set", { app: a.app, active: a.active });
          return;
        }
        case "approve_app": {
          notPaused();
          const app = String(a.app);
          activeApp(app);
          const key = pair(caller, app);
          const added = !v().limits.has(key);
          const version = (v().limits.get(key)?.version ?? 0) + 1;
          const expiry = a.expiry == null ? 0 : Number(a.expiry);
          v().limits.set(key, { remaining: big(a.limit), expiry, version });
          if (added) payStorage(caller, LIMIT_BYTES);
          emit("app_approved", { user: caller, app, limit: a.limit, expiry });
          return;
        }
        case "revoke_app": {
          const app = String(a.app);
          require(v().apps.has(app), "Unknown app");
          const key = pair(caller, app);
          // Nothing approved means nothing to revoke, and no new state for the vault to pay for.
          if (!v().limits.has(key)) return;
          const version = v().limits.get(key)!.version + 1;
          v().limits.set(key, { remaining: 0n, expiry: 0, version });
          emit("app_revoked", { user: caller, app });
          return;
        }
        case "charge": {
          onlyOperator(caller);
          notPaused();
          const [user, app, amount, ref] = [String(a.user), String(a.app), big(a.amount), String(a.ref_id)];
          useRef(app, ref);
          consumeLimit(user, app, amount);
          debit(user, amount);
          v().totals.balances -= amount;
          const fee = earn(user, app, amount);
          emit("charged", { user, app, ref_id: ref, amount, fee });
          return;
        }
        case "hold": {
          onlyOperator(caller);
          notPaused();
          const [user, app, amount, ref, expiry] = [String(a.user), String(a.app), big(a.amount), String(a.ref_id), Number(a.expiry)];
          require(expiry > nowSec() && expiry <= nowSec() + MAX_HOLD_SECONDS, "Bad expiry");
          useRef(app, ref);
          consumeLimit(user, app, amount);
          debit(user, amount);
          v().totals.balances -= amount;
          v().totals.held += amount;
          const holdId = createHash("sha256").update(Buffer.concat([Buffer.from(app), Buffer.from([0]), Buffer.from(ref)])).digest("hex");
          const version = v().limits.get(pair(user, app))?.version ?? 0;
          v().holds.set(holdId, { user, app, amount, expiry, limit_version: version, status: "Open" });
          emit("held", { hold_id: holdId, user, app, ref_id: ref, amount, expiry });
          return;
        }
        case "capture": {
          onlyOperator(caller);
          notPaused();
          const id = String(a.hold_id);
          const h = v().holds.get(id);
          require(!!h && h.status === "Open", "Hold not open");
          require(nowSec() < h!.expiry, "Hold expired");
          const actual = big(a.actual);
          require(actual > 0n, "Zero amount");
          require(actual <= h!.amount, "Over held");
          h!.status = "Captured";
          v().totals.held -= h!.amount;
          const returned = h!.amount - actual;
          if (returned > 0n) returnToUser(h!, returned);
          const fee = earn(h!.user, h!.app, actual);
          emit("captured", { hold_id: id, actual, fee, returned });
          return;
        }
        case "release": {
          const id = String(a.hold_id);
          const h = v().holds.get(id);
          require(!!h && h.status === "Open", "Hold not open");
          require(nowSec() >= h!.expiry || v().operators.has(caller), "Hold not expired");
          h!.status = "Released";
          v().totals.held -= h!.amount;
          returnToUser(h!, h!.amount);
          emit("released", { hold_id: id, amount: h!.amount, by: caller });
          return;
        }
        case "refund": {
          onlyOperator(caller);
          notPaused();
          const [app, user, amount, ref] = [String(a.app), String(a.user), big(a.amount), String(a.ref_id)];
          require(amount > 0n, "Zero amount");
          require(v().apps.has(app), "Unknown app");
          useRef(app, ref);
          const spent = v().spent.get(pair(user, app)) ?? 0n;
          require(amount <= spent, "Over spent");
          const earned = v().earnings.get(app) ?? 0n;
          require(amount <= earned, "Insufficient earnings");
          v().spent.set(pair(user, app), spent - amount);
          v().earnings.set(app, earned - amount);
          v().totals.earnings -= amount;
          addBalance(user, amount);
          v().totals.balances += amount;
          emit("refunded", { app, user, ref_id: ref, amount });
          return;
        }
        case "send": {
          notPaused();
          const [to, amount] = [String(a.to), big(a.amount)];
          require(amount > 0n, "Zero amount");
          require(caller !== to, "Same account");
          require(v().storage.has(to), "Recipient not registered");
          debit(caller, amount);
          addBalance(to, amount);
          emit("sent", { from: caller, to, amount });
          return;
        }
        case "create_claim": {
          notPaused();
          const id = String(a.claim_key);
          require(id.startsWith("ed25519:"), "Claim key must be ed25519");
          const amount = big(a.amount);
          require(amount > 0n, "Zero amount");
          require(Number(a.expiry) > nowSec(), "Bad expiry");
          require(!v().claims.has(id), "Claim exists");
          debit(caller, amount);
          v().totals.balances -= amount;
          v().totals.claims += amount;
          v().claims.set(id, { from: caller, amount, expiry: Number(a.expiry), status: "Open" });
          payStorage(caller, CLAIM_BYTES);
          emit("claim_created", { claim_key: id, from: caller, amount, expiry: a.expiry });
          return;
        }
        case "claim": {
          notPaused();
          const id = String(a.claim_key);
          const cl = v().claims.get(id);
          require(!!cl && cl.status === "Open", "Claim not open");
          require(nowSec() < cl!.expiry, "Claim expired");
          const to = String(a.to);
          const sig = Buffer.from(String(a.signature), "base64");
          require(sig.length === 64 && PublicKey.fromString(id).verify(Buffer.from(claimMessage(id, to)), sig), "Bad signature");
          require(v().storage.has(to), "Recipient not registered");
          cl!.status = "Claimed";
          v().totals.claims -= cl!.amount;
          addBalance(to, cl!.amount);
          v().totals.balances += cl!.amount;
          emit("claimed", { claim_key: id, to, amount: cl!.amount });
          return;
        }
        case "cancel_claim": {
          const id = String(a.claim_key);
          const cl = v().claims.get(id);
          require(!!cl && cl.status === "Open", "Claim not open");
          require(caller === cl!.from || v().operators.has(caller) || nowSec() >= cl!.expiry, "Claim not expired");
          cl!.status = "Cancelled";
          v().totals.claims -= cl!.amount;
          addBalance(cl!.from, cl!.amount);
          v().totals.balances += cl!.amount;
          emit("claim_cancelled", { claim_key: id, by: caller, amount: cl!.amount });
          return;
        }
        case "storage_deposit": {
          // Anyone can register anyone. Above the minimum goes to what the account's own calls use later.
          const account = String(a.account_id ?? caller);
          const min = ACCOUNT_BYTES * BYTE_COST;
          const d = v().storage.get(account);
          let refund = 0n;
          if (d) {
            if (a.registration_only) refund = deposit;
            else {
              d.total += deposit;
              d.available += deposit;
            }
          } else {
            require(deposit >= min, "Below minimum storage deposit");
            const kept = a.registration_only ? min : deposit;
            refund = deposit - kept;
            v().storage.set(account, { total: kept, available: kept - min });
            emit("storage_registered", { account, by: caller });
          }
          if (refund > 0n) state.accounts.get(caller)!.balance += refund;
          return;
        }
        default:
          require(false, `Method ${method} not found`);
      }
    });
  }

  function payout(c: Ctx, caller: string, app: string) {
    const r = receipt(c, vaultId, () => {
      const a = v().apps.get(app);
      require(!!a, "Unknown app");
      require(caller === a!.payout || v().operators.has(caller) || caller === v().owner, "Not authorized");
      const amount = v().earnings.get(app) ?? 0n;
      require(amount > 0n, "Zero amount");
      v().earnings.set(app, 0n);
      v().totals.earnings -= amount;
      return { to: a!.payout, amount };
    });
    if (!r.ok) return;
    const { to, amount } = r.value!;
    const before = c.failure;
    usdtCall(c, vaultId, "ft_transfer", { receiver_id: to, amount: amount.toString() }, 1n);
    const ok = c.failure === before;
    // A failed transfer in a promise chain isn't the transaction's failure: the callback handles it.
    c.failure = before;
    receipt(c, vaultId, (emit) => {
      if (ok) return emit("paid_out", { app, to, amount });
      v().earnings.set(app, (v().earnings.get(app) ?? 0n) + amount);
      v().totals.earnings += amount;
      emit("payout_failed", { app, to, amount });
    });
  }

  function vaultView(method: string, a: Record<string, unknown>): unknown {
    const s = v();
    const u128 = (x: bigint) => x.toString();
    switch (method) {
      case "balance_of":
        return u128(s.balances.get(String(a.user)) ?? 0n);
      case "limit_of": {
        const l = s.limits.get(pair(String(a.user), String(a.app)));
        return { remaining: u128(l?.remaining ?? 0n), expiry: l?.expiry ?? 0, version: l?.version ?? 0 };
      }
      case "get_app": {
        const app = s.apps.get(String(a.app));
        return app ? { payout: app.payout, fee_bps: app.fee_bps, max_charge: u128(app.max_charge), active: app.active } : null;
      }
      case "earnings_of":
        return u128(s.earnings.get(String(a.app)) ?? 0n);
      case "get_hold": {
        const h = s.holds.get(String(a.hold_id));
        return h ? { user: h.user, app: h.app, amount: u128(h.amount), expiry: h.expiry, limit_version: h.limit_version, status: h.status } : null;
      }
      case "get_claim": {
        const cl = s.claims.get(String(a.claim_key));
        return cl ? { from: cl.from, amount: u128(cl.amount), expiry: cl.expiry, status: cl.status } : null;
      }
      case "claim_message":
        return claimMessage(String(a.claim_key), String(a.to));
      case "storage_balance_of": {
        const d = s.storage.get(String(a.account_id));
        return d ? { total: u128(d.total), available: u128(d.available) } : null;
      }
      case "storage_balance_bounds":
        return { min: u128(ACCOUNT_BYTES * BYTE_COST), max: null };
      case "is_operator":
        return s.operators.has(String(a.account));
      case "totals": {
        const t = s.totals;
        const liabilities = t.balances + t.held + t.claims + t.earnings + t.fees;
        return { balances: u128(t.balances), held: u128(t.held), claims: u128(t.claims), earnings: u128(t.earnings), fees: u128(t.fees), liabilities: u128(liabilities) };
      }
      default:
        throw new Error(`no view ${method} on the vault`);
    }
  }

  // ---------------------------------------------------------------- transactions

  function callContract(c: Ctx, caller: string, receiver: string, method: string, args: Record<string, unknown>, deposit: bigint) {
    const from = state.accounts.get(caller);
    if (deposit > 0n) {
      if (!from || from.balance < deposit) {
        c.failure ??= "NotEnoughBalance";
        return;
      }
      from.balance -= deposit;
    }
    if (receiver === usdtId) return usdtCall(c, caller, method, args, deposit);
    if (receiver === vaultId) return vaultCall(c, caller, method, args, deposit);
    c.failure ??= "AccountDoesNotExist";
  }

  function transfer(c: Ctx, from: string, to: string, amount: bigint) {
    const f = state.accounts.get(from)!;
    if (f.balance < amount) return void (c.failure ??= "NotEnoughBalance");
    f.balance -= amount;
    let t = state.accounts.get(to);
    if (!t) {
      // An implicit account is created by its first transfer, with its own key as full access.
      if (!/^[0-9a-f]{64}$/.test(to)) return void (c.failure ??= "AccountDoesNotExist");
      const key = new PublicKey({ keyType: 0, data: Buffer.from(to, "hex") }).toString();
      t = { balance: 0n, keys: new Map([[key, BigInt(height) * 1_000_000n]]) };
      state.accounts.set(to, t);
    }
    t.balance += amount;
  }

  function delegate(c: Ctx, receiver: string, d: Extract<TxAction, { kind: "delegate" }>) {
    const da = d.delegate;
    if (da.senderId !== receiver) return void (c.failure ??= "DelegateActionSenderDoesNotMatchTxReceiver");
    if (BigInt(height) > da.maxBlockHeight) return void (c.failure ??= "DelegateActionExpired");
    const hash = createHash("sha256").update(encodeDelegateAction(da)).digest();
    if (!da.publicKey.verify(hash, d.signature)) return void (c.failure ??= "DelegateActionInvalidSignature");
    const account = state.accounts.get(da.senderId);
    const nonce = account?.keys.get(da.publicKey.toString());
    if (nonce === undefined) return void (c.failure ??= "DelegateActionAccessKeyError");
    if (da.nonce <= nonce) return void (c.failure ??= "DelegateActionInvalidNonce");
    account!.keys.set(da.publicKey.toString(), da.nonce);
    for (const action of da.actions) {
      const fc = action.functionCall;
      if (!fc) continue;
      const args = JSON.parse(Buffer.from(fc.args).toString()) as Record<string, unknown>;
      callContract(c, da.senderId, da.receiverId, fc.methodName, args, BigInt(fc.deposit));
    }
  }

  const chain: FakeChain = {
    network: "testnet",
    relayerId,
    vault: vaultId,
    usdt: usdtId,
    sent,

    async view<T>(contract: string, method: string, args: Record<string, unknown> = {}) {
      if (contract === vaultId) return vaultView(method, args) as T;
      if (contract === usdtId) {
        if (method === "ft_balance_of") return (state.usdt.balances.get(String(args.account_id)) ?? 0n).toString() as T;
        if (method === "storage_balance_of") {
          return (state.usdt.registered.has(String(args.account_id)) ? { total: STORAGE_COST.toString(), available: "0" } : null) as T;
        }
        if (method === "storage_balance_bounds") return { min: STORAGE_COST.toString(), max: STORAGE_COST.toString() } as T;
      }
      throw new Error(`no view ${method} on ${contract}`);
    },

    async send(receiver: string, actions: TxAction[]): Promise<Outcome> {
      height++;
      const c: Ctx = { events: [], receipts: 0 };
      for (const a of actions) {
        if (c.failure) break;
        if (a.kind === "transfer") transfer(c, relayerId, receiver, a.amount);
        if (a.kind === "call") callContract(c, relayerId, receiver, a.method, a.args, a.deposit);
        if (a.kind === "delegate") delegate(c, receiver, a);
      }
      const gasBurnt = BigInt(c.receipts + 1) * GAS_PER_RECEIPT;
      const burnt = gasBurnt * GAS_PRICE;
      state.accounts.get(relayerId)!.balance -= burnt;
      const hash = createHash("sha256").update(`${height}:${receiver}:${sent.length}`).digest("base64url").slice(0, 44);
      const outcome: Outcome = { hash, block: height, at: now(), failure: c.failure, gasBurnt, burnt, events: c.events };
      sent.push(outcome);
      return outcome;
    },

    async balanceOf(account) {
      return state.accounts.get(account)?.balance;
    },

    async accessKeyNonce(account, key) {
      return state.accounts.get(account)?.keys.get(key.toString());
    },

    async head() {
      return { height, at: now() };
    },

    async gasPrice() {
      return GAS_PRICE;
    },

    advance(seconds) {
      offsetMs += seconds * 1000;
      height += seconds;
    },

    mint(account, units) {
      state.usdt.registered.add(account);
      state.usdt.balances.set(account, (state.usdt.balances.get(account) ?? 0n) + units);
    },
  };
  return chain;
}

/** A fresh user key, as a Privy NEAR wallet holds it, with its implicit account. */
export function newUserKey() {
  const key = KeyPair.fromRandom("ed25519");
  const publicKey = key.getPublicKey();
  return { key, publicKey: publicKey.toString(), account: hex(publicKey.data), secret: key.toString() as KeyPairString };
}
