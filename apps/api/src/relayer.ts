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

export function createRelayer(opts: { clients: Clients; db: Db; txTimeoutMs: number }) {
  const { clients, db, txTimeoutMs } = opts;
  const { publicClient, walletClient, operator } = clients;
  let tail: Promise<unknown> = Promise.resolve();

  /** Runs `job` after every earlier job has finished, whether it succeeded or not. */
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  }

  function record(tx: RelayerTx): RelayerTx {
    db.data.txs.push(tx);
    db.save();
    return tx;
  }

  async function send<abi extends Abi, name extends ContractFunctionName<abi, "nonpayable" | "payable">>(
    request: WriteRequest<abi, name>,
  ): Promise<RelayResult> {
    const fn = request.functionName as string;

    // The public write() signature is fully typed; inside, viem's generics are erased once here.
    type SimulateArgs = Parameters<typeof publicClient.simulateContract>[0];
    type WriteArgs = Parameters<typeof walletClient.writeContract>[0];

    let prepared: WriteArgs;
    try {
      const simulated = await publicClient.simulateContract({ ...request, account: operator } as unknown as SimulateArgs);
      prepared = simulated.request as unknown as WriteArgs;
    } catch (err) {
      const reason = revertReason(err);
      record({ fn, status: "failed", gasUsed: 0n, l2Fee: 0n, l1Fee: 0n, error: reason, at: Date.now() });
      throw new RelayerError(reason);
    }

    const hash = await walletClient.writeContract(prepared);
    // Recorded before waiting, so a crash mid-flight still leaves the hash in the ledger.
    const tx = record({ hash, fn, status: "pending", gasUsed: 0n, l2Fee: 0n, l1Fee: 0n, at: Date.now() });

    let receipt: TransactionReceipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: txTimeoutMs });
    } catch (err) {
      tx.error = revertReason(err);
      db.save();
      throw new RelayerError(`no receipt for ${hash}: ${tx.error}`, hash);
    }

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

    /** Simulates, sends and waits for one contract call, in queue order. */
    write<abi extends Abi, name extends ContractFunctionName<abi, "nonpayable" | "payable">>(
      request: WriteRequest<abi, name>,
    ): Promise<RelayResult> {
      return enqueue(() => send(request));
    },

    /** The relayer's gas balance, in wei. */
    balance: () => publicClient.getBalance({ address: operator.address }),

    /** Gas spent on transactions since `since` (ms timestamp), in wei. */
    spent(since = 0) {
      let total = 0n;
      let count = 0;
      for (const t of db.data.txs) {
        if (t.at < since || t.status === "failed") continue;
        total += t.l2Fee + t.l1Fee;
        count++;
      }
      return { count, wei: total };
    },
  };
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
