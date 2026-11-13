/**
 * The relayer signs every transaction the network sends and pays its gas in NEAR. Users and
 * companies never hold NEAR.
 *
 * - One queue: transactions go out one at a time, so the relayer key's nonce never collides.
 * - Budgets first: the most a transaction can cost (its prepaid gas at today's gas price) is
 *   checked against the daily budgets and the balance floor before anything is sent.
 * - Wait until final, then record what it cost (every receipt's burnt tokens) and hand back the
 *   vault's events. A failed receipt becomes a RelayerError named after the contract's panic.
 */
import type { Db, RelayerTx } from "./db.js";
import { TGAS, type AccountId, type Chain, type ChainEvent, type Outcome, type TxAction, type TxHash } from "./near.js";

export class RelayerError extends Error {
  constructor(
    /** The contract's error, as a code such as "OverLimit", or a short message. */
    readonly reason: string,
    readonly hash?: TxHash,
  ) {
    super(reason);
    this.name = "RelayerError";
  }
}

export type RelayResult = { hash: TxHash; outcome: Outcome; events: ChainEvent[]; tx: RelayerTx };

/** What stops a drain. Every check runs before sending, so a refused transaction costs nothing. */
export type RelayerLimits = {
  /** Most gas one transaction may attach, in gas units. */
  maxTxGas: bigint;
  /** Most the relayer spends in any rolling 24 hours, in yoctoNEAR. */
  dailyBudget: bigint;
  /** Most spent on one app's transactions in any rolling 24 hours, in yoctoNEAR. */
  appDailyBudget: bigint;
  /** Below this balance, only exits go out, so users can always get their credits back. */
  minBalance: bigint;
};

/** Calls that give users or companies their money back. They skip the budgets, never the gas ceiling. */
const EXITS = new Set(["release", "payout", "revoke_app", "cancel_claim"]);

const DAY_MS = 86_400_000;
const SEND_RETRIES = 2;

/** Contract panics that map to their own error codes. Everything else is PascalCased. */
const RENAMED: Record<string, string> = {
  Paused: "EnforcedPause",
  DelegateActionExpired: "SignatureExpired",
  DelegateActionInvalidNonce: "NonceUsed",
  DelegateActionInvalidSignature: "BadSignature",
  DelegateActionSenderDoesNotMatchTxReceiver: "BadSignature",
};

/** "Over limit" -> "OverLimit". */
export function reasonCode(failure: string): string {
  const code = /^[A-Z][A-Za-z]+$/.test(failure)
    ? failure
    : failure
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join("");
  return RENAMED[code] ?? code;
}

/** Whether a send failure is worth retrying. Failed receipts never are: they come back as outcomes. */
export function transient(err: unknown): boolean {
  const text = String((err as Error)?.message ?? err);
  return /timeout|timed out|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|502|503|504|rate limit|TooManyRequests|InvalidNonce|Expired/i.test(text);
}

/** The gas a transaction attaches: its function calls, plus those inside a delegate. */
export function prepaidGas(actions: TxAction[]): bigint {
  let gas = 0n;
  for (const a of actions) {
    if (a.kind === "call") gas += a.gas;
    if (a.kind === "transfer") gas += 1n * TGAS;
    if (a.kind === "delegate") {
      for (const inner of a.delegate.actions) gas += BigInt(inner.functionCall?.gas ?? 0n) + 1n * TGAS;
    }
  }
  return gas;
}

export function createRelayer(opts: { chain: Chain; db: Db; vault: AccountId; limits?: RelayerLimits }) {
  const { chain, db, vault, limits } = opts;
  let tail: Promise<unknown> = Promise.resolve();
  const listeners: ((r: RelayResult) => void)[] = [];

  /** Runs `job` after every earlier job has finished, whether it succeeded or not. */
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  }

  /** NEAR spent on sent transactions since `since` (ms timestamp), in yoctoNEAR. Optionally for one app. */
  function spent(since = 0, app?: string) {
    let total = 0n;
    let count = 0;
    for (const t of db.data.txs) {
      if (t.at < since || t.status === "failed") continue;
      if (app && t.app !== app) continue;
      total += t.fee;
      count++;
    }
    return { count, yocto: total };
  }

  function record(tx: RelayerTx): RelayerTx {
    db.data.txs.push(tx);
    db.save();
    return tx;
  }

  async function sendWithRetry(receiver: AccountId, actions: TxAction[]): Promise<Outcome> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await chain.send(receiver, actions);
      } catch (err) {
        if (!transient(err) || attempt >= SEND_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      }
    }
  }

  async function send(receiver: AccountId, actions: TxAction[], fn: string, app?: string): Promise<RelayResult> {
    const refuse = (reason: string): never => {
      record({ fn, app, status: "failed", gasUsed: 0n, fee: 0n, error: reason, at: Date.now() });
      throw new RelayerError(reason);
    };

    if (limits) {
      const gas = prepaidGas(actions);
      if (gas > limits.maxTxGas) refuse("GasTooHigh");
      if (!EXITS.has(fn)) {
        const [price, balance] = await Promise.all([chain.gasPrice(), chain.balanceOf(chain.relayerId)]);
        // The most this transaction can cost: all its prepaid gas burnt at today's price.
        const worst = gas * price;
        const since = Date.now() - DAY_MS;
        if ((balance ?? 0n) - worst < limits.minBalance) refuse("RelayerLowBalance");
        if (spent(since).yocto + worst > limits.dailyBudget) refuse("DailyBudgetReached");
        if (app && spent(since, app).yocto + worst > limits.appDailyBudget) refuse("AppBudgetReached");
      }
    }

    const outcome = await sendWithRetry(receiver, actions);
    const ok = !outcome.failure;
    const tx = record({
      hash: outcome.hash,
      fn,
      app,
      status: ok ? "success" : "reverted",
      gasUsed: outcome.gasBurnt,
      fee: outcome.burnt,
      error: outcome.failure,
      at: Date.now(),
    });
    const events = outcome.events.filter((e) => e.standard === "kredo" && e.executor === vault);
    const result = { hash: outcome.hash, outcome, events, tx };
    // The indexer reads every outcome, failed ones included: a failed transaction can still have
    // moved credits in an earlier receipt.
    for (const l of listeners) l(result);
    if (!ok) throw new RelayerError(reasonCode(outcome.failure!), outcome.hash);
    return result;
  }

  return {
    operator: chain.relayerId,

    /** Calls one vault method as the relayer, in queue order. `app` tags its gas. */
    write(
      call: { method: string; args: Record<string, unknown>; gas?: bigint; deposit?: bigint; receiver?: AccountId },
      opts: { app?: string } = {},
    ): Promise<RelayResult> {
      const action: TxAction = { kind: "call", method: call.method, args: call.args, gas: call.gas ?? 30n * TGAS, deposit: call.deposit ?? 0n };
      return enqueue(() => send(call.receiver ?? vault, [action], call.method, opts.app));
    },

    /** Sends any actions to any receiver: user account set-up, token transfers, signed delegates. */
    send(receiver: AccountId, actions: TxAction[], opts: { fn: string; app?: string }): Promise<RelayResult> {
      return enqueue(() => send(receiver, actions, opts.fn, opts.app));
    },

    /** Called with every outcome the relayer gets back. */
    onResult(listener: (r: RelayResult) => void) {
      listeners.push(listener);
    },

    /** The relayer's NEAR balance, in yoctoNEAR. */
    balance: async () => (await chain.balanceOf(chain.relayerId)) ?? 0n,

    spent,

    /** The limits, today's spend against them, and whether only exits can go out. */
    async status() {
      const balance = (await chain.balanceOf(chain.relayerId)) ?? 0n;
      const today = spent(Date.now() - DAY_MS);
      if (!limits) return { balance, today, limits: undefined, exitsOnly: false };
      return {
        balance,
        today,
        limits,
        budgetLeft: limits.dailyBudget > today.yocto ? limits.dailyBudget - today.yocto : 0n,
        exitsOnly: today.yocto >= limits.dailyBudget || balance < limits.minBalance,
      };
    },
  };
}

/** The first vault event of a kind in a relayed transaction. */
export function vaultEvent(result: Pick<RelayResult, "events" | "hash">, event: string): Record<string, unknown> {
  const e = result.events.find((x) => x.event === event);
  if (!e) throw new Error(`no ${event} event in ${result.hash}`);
  return e.data;
}

export type Relayer = ReturnType<typeof createRelayer>;
