/**
 * The relayer submits every operator transaction and pays its gas. Users and companies never
 * hold the gas token.
 *
 * - One queue: transactions go out one at a time, so nonces never collide.
 * - Simulate first: a call that would revert fails here for free, with the contract's error name,
 *   instead of costing gas onchain.
 * - Wait for the receipt before the next transaction, and record what it cost: the L2 execution
 *   fee plus the L1 data fee that OP Stack chains charge on every transaction.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
  type TransactionReceipt,
} from "viem";
import type { Clients } from "./chain.js";
import type { Db, RelayerTx } from "./db.js";

export class RelayerError extends Error {
  constructor(
    /** The contract's custom error name, such as "OverLimit", or a short message. */
    readonly reason: string,
    readonly hash?: Hash,
  ) {
    super(reason);
    this.name = "RelayerError";
  }
}

export type WriteRequest<
  abi extends Abi,
  name extends ContractFunctionName<abi, "nonpayable" | "payable">,
> = {
  address: Address;
  abi: abi;
  functionName: name;
  args: ContractFunctionArgs<abi, "nonpayable" | "payable", name>;
};

export type RelayResult = { hash: Hash; receipt: TransactionReceipt; tx: RelayerTx };

/** What stops a drain. Every check runs before sending, so a refused transaction costs nothing. */
export type RelayerLimits = {
  /** Most gas one transaction may use. */
  maxTxGas: bigint;
  /** Highest gas price we pay, in wei. */
  maxGasPrice: bigint;
  /** Most WBT the relayer spends in any rolling 24 hours, in wei. */
  dailyBudget: bigint;
  /** Most WBT spent on one app's transactions in any rolling 24 hours, in wei. */
  appDailyBudget: bigint;
  /** Below this balance, only exits go out, so users can always get their credits back. */
  minBalance: bigint;
};

/** Calls that give users or companies their money back. They skip the budgets, never the gas ceiling. */
const EXITS = new Set(["release", "payout", "revokeApp", "cancelClaim"]);

const DAY_MS = 86_400_000;
const SEND_RETRIES = 2;

/** Whether a send failure is worth retrying, and why. Contract reverts never are. */
export function transient(err: unknown): "nonce" | "network" | undefined {
  const text = err instanceof BaseError ? `${err.shortMessage} ${err.details ?? ""}` : String((err as Error)?.message ?? err);
  if (/nonce too low|nonce has already been used|replacement transaction underpriced|already known/i.test(text)) return "nonce";
  if (/timeout|timed out|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|HTTP request failed|502|503|504|rate limit/i.test(text)) return "network";
  return undefined;
}

export function createRelayer(opts: { clients: Clients; db: Db; txTimeoutMs: number; limits?: RelayerLimits }) {
  const { clients, db, txTimeoutMs, limits } = opts;
  const { publicClient, walletClient, operator } = clients;
  let tail: Promise<unknown> = Promise.resolve();

  /** Runs `job` after every earlier job has finished, whether it succeeded or not. */
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  }

  /** Gas spent on sent transactions since `since` (ms timestamp), in wei. Optionally for one app. */
  function spent(since = 0, app?: Address) {
    let total = 0n;
    let count = 0;
    for (const t of db.data.txs) {
      if (t.at < since || t.status === "failed") continue;
      if (app && t.app?.toLowerCase() !== app.toLowerCase()) continue;
      total += t.l2Fee + t.l1Fee;
      count++;
    }
    return { count, wei: total };
  }

  function record(tx: RelayerTx): RelayerTx {
    db.data.txs.push(tx);
    db.save();
    return tx;
  }

  /**
   * Sends, retrying what's safe to retry: RPC hiccups, and nonce clashes after the local nonce
   * drifted from the chain (it's reset first). Every relayed call is idempotent onchain (charge,
   * hold and refund refs; signature nonces), so a resend can never move credits twice.
   */
  async function sendWithRetry(prepared: Parameters<typeof walletClient.writeContract>[0]): Promise<Hash> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await walletClient.writeContract(prepared);
      } catch (err) {
        const kind = transient(err);
        if (!kind || attempt >= SEND_RETRIES) throw err;
        if (kind === "nonce") operator.nonceManager?.reset({ address: operator.address, chainId: clients.chain.id });
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      }
    }
  }

  async function send<abi extends Abi, name extends ContractFunctionName<abi, "nonpayable" | "payable">>(
    request: WriteRequest<abi, name>,
    app?: Address,
  ): Promise<RelayResult> {
    const fn = request.functionName as string;

    // The public write() signature is fully typed; inside, viem's generics are erased once here.
    type SimulateArgs = Parameters<typeof publicClient.simulateContract>[0];
    type WriteArgs = Parameters<typeof walletClient.writeContract>[0];

    const refuse = (reason: string): never => {
      record({ fn, app, status: "failed", gasUsed: 0n, l2Fee: 0n, l1Fee: 0n, error: reason, at: Date.now() });
      throw new RelayerError(reason);
    };

    let prepared: WriteArgs;
    try {
      const simulated = await publicClient.simulateContract({ ...request, account: operator } as unknown as SimulateArgs);
      prepared = simulated.request as unknown as WriteArgs;
    } catch (err) {
      return refuse(revertReason(err));
    }

    if (limits) {
      const [gas, fees, balance] = await Promise.all([
        publicClient.estimateContractGas({ ...request, account: operator } as unknown as Parameters<
          typeof publicClient.estimateContractGas
        >[0]),
        publicClient.estimateFeesPerGas(),
        publicClient.getBalance({ address: operator.address }),
      ]);
      if (gas > limits.maxTxGas) refuse("GasTooHigh");
      if (fees.maxFeePerGas > limits.maxGasPrice) refuse("GasPriceTooHigh");

      // A 20% buffer over the estimate, never above the ceiling. The most this transaction can cost.
      const gasLimit = min((gas * 12n) / 10n, limits.maxTxGas);
      const worst = gasLimit * fees.maxFeePerGas;
      if (!EXITS.has(fn)) {
        const since = Date.now() - DAY_MS;
        if (balance - worst < limits.minBalance) refuse("RelayerLowBalance");
        if (spent(since).wei + worst > limits.dailyBudget) refuse("DailyBudgetReached");
        if (app && spent(since, app).wei + worst > limits.appDailyBudget) refuse("AppBudgetReached");
      }
      prepared = {
        ...prepared,
        gas: gasLimit,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      } as WriteArgs;
    }

    const hash = await sendWithRetry(prepared);
    // Recorded before waiting, so a crash mid-flight still leaves the hash in the ledger.
    const tx = record({ hash, fn, app, status: "pending", gasUsed: 0n, l2Fee: 0n, l1Fee: 0n, at: Date.now() });

    let receipt: TransactionReceipt | undefined;
    // A slow block or a dropped RPC call isn't a failed transaction: wait once more before giving up.
    for (let attempt = 0; attempt < 2 && !receipt; attempt++) {
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: txTimeoutMs });
      } catch (err) {
        tx.error = revertReason(err);
        db.save();
        if (attempt === 1) throw new RelayerError(`no receipt for ${hash}: ${tx.error}`, hash);
      }
    }
    if (!receipt) throw new RelayerError(`no receipt for ${hash}`, hash);
    tx.error = undefined;

    tx.gasUsed = receipt.gasUsed;
    tx.l2Fee = receipt.gasUsed * receipt.effectiveGasPrice;
    tx.l1Fee = (receipt as { l1Fee?: bigint | null }).l1Fee ?? 0n;
    tx.status = receipt.status === "success" ? "success" : "reverted";
    db.save();
    if (receipt.status !== "success") throw new RelayerError("reverted onchain", hash);
    return { hash, receipt, tx };
  }

  return {
    operator: operator.address,

    /** Simulates, sends and waits for one contract call, in queue order. `app` tags its gas. */
    write<abi extends Abi, name extends ContractFunctionName<abi, "nonpayable" | "payable">>(
      request: WriteRequest<abi, name>,
      opts: { app?: Address } = {},
    ): Promise<RelayResult> {
      return enqueue(() => send(request, opts.app));
    },

    /** The relayer's gas balance, in wei. */
    balance: () => publicClient.getBalance({ address: operator.address }),

    spent,

    /** The limits, today's spend against them, and whether only exits can go out. */
    async status() {
      const balance = await publicClient.getBalance({ address: operator.address });
      const today = spent(Date.now() - DAY_MS);
      if (!limits) return { balance, today, limits: undefined, exitsOnly: false };
      return {
        balance,
        today,
        limits,
        budgetLeft: limits.dailyBudget > today.wei ? limits.dailyBudget - today.wei : 0n,
        exitsOnly: today.wei >= limits.dailyBudget || balance < limits.minBalance,
      };
    },
  };
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export type Relayer = ReturnType<typeof createRelayer>;

/** Turns a viem error into a short reason: the contract's custom error name when there is one. */
export function revertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.data?.errorName ?? reverted.reason ?? reverted.shortMessage;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}
