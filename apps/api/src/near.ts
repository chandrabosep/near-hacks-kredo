/**
 * Everything that talks to NEAR. The rest of the API sees only the `Chain` interface:
 * views, transactions the relayer signs, and what came back from them. Tests use an
 * in-memory chain behind the same interface.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Account,
  actions as nearActions,
  JsonRpcProvider,
  KeyPairSigner,
  KeyType,
  PublicKey,
  Signature,
  type Action,
  type DelegateAction,
  type KeyPairString,
} from "near-api-js";
import { z } from "zod";

export type AccountId = string;
/** A NEAR transaction hash, base58. */
export type TxHash = string;

/** 1 NEAR in yoctoNEAR. */
export const YOCTO_PER_NEAR = 10n ** 24n;
export const TGAS = 10n ** 12n;
export const ONE_YOCTO = 1n;

const ACCOUNT_ID = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export const isAccountId = (v: string) => ACCOUNT_ID.test(v);

export const accountIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isAccountId, "must be a NEAR account ID, like alice.testnet");

/** NEAR amounts such as "0.25" read as yoctoNEAR. */
export function parseNear(value: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(value.trim());
  if (!m) throw new RangeError(`"${value}" is not a NEAR amount`);
  return BigInt(m[1]) * YOCTO_PER_NEAR + BigInt((m[2] ?? "").padEnd(24, "0") || "0");
}

/** yoctoNEAR as a NEAR decimal string, trimmed to `digits` places. */
export function formatNear(yocto: bigint, digits = 6): string {
  const sign = yocto < 0n ? "-" : "";
  const abs = yocto < 0n ? -yocto : yocto;
  const whole = abs / YOCTO_PER_NEAR;
  const frac = (abs % YOCTO_PER_NEAR).toString().padStart(24, "0").slice(0, digits).replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------- keys

/** An ed25519 public key from hex, base58, or "ed25519:<base58>". */
export function toPublicKey(value: string): PublicKey {
  const v = value.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(v)) {
    return new PublicKey({ keyType: KeyType.ED25519, data: Buffer.from(v.replace(/^0x/, ""), "hex") });
  }
  return PublicKey.fromString(v.includes(":") ? v : `ed25519:${v}`);
}

/** The implicit account ID of an ed25519 key: its 32 bytes in hex. */
export function implicitAccountOf(key: PublicKey): AccountId {
  return Buffer.from(key.data).toString("hex");
}

export const isImplicitAccount = (id: string) => /^[0-9a-f]{64}$/.test(id);

// ---------------------------------------------------------------- transactions

export type CallAction = { kind: "call"; method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint };
export type TransferAction = { kind: "transfer"; amount: bigint };
/** A user's signed delegate action (NEP-366), which the relayer wraps and pays for. */
export type DelegateTxAction = { kind: "delegate"; delegate: DelegateAction; signature: Uint8Array };
export type TxAction = CallAction | TransferAction | DelegateTxAction;

export const call = (method: string, args: Record<string, unknown>, opts: { gas?: bigint; deposit?: bigint } = {}): CallAction => ({
  kind: "call",
  method,
  args,
  gas: opts.gas ?? 30n * TGAS,
  deposit: opts.deposit ?? 0n,
});

/** One NEP-297 event from a receipt's logs, with the contract that wrote it. */
export type ChainEvent = { standard: string; event: string; data: Record<string, unknown>; executor: AccountId; index: number };

export type Outcome = {
  hash: TxHash;
  /** Height and time (ms) of the block that included the transaction. */
  block: number;
  at: number;
  /** The first failure in the transaction or any of its receipts, as the contract said it. */
  failure?: string;
  /** Gas units burnt, and what they cost in yoctoNEAR, across every receipt. */
  gasBurnt: bigint;
  burnt: bigint;
  events: ChainEvent[];
};

export interface Chain {
  readonly network: string;
  readonly relayerId: AccountId;
  view<T>(contract: AccountId, method: string, args?: Record<string, unknown>): Promise<T>;
  /** Signs with the relayer key, sends, and waits until final. Never throws for a failed receipt. */
  send(receiver: AccountId, actions: TxAction[]): Promise<Outcome>;
  balanceOf(account: AccountId): Promise<bigint | undefined>;
  /** The access key's nonce, or undefined when the account or key doesn't exist. */
  accessKeyNonce(account: AccountId, key: PublicKey): Promise<bigint | undefined>;
  head(): Promise<{ height: number; at: number }>;
  gasPrice(): Promise<bigint>;
}

// ---------------------------------------------------------------- outcome parsing

const EVENT_PREFIX = "EVENT_JSON:";

type ExecutionStatus = { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown } | string;
type ExecutionOutcome = { logs: string[]; gas_burnt: number | string; tokens_burnt: string; executor_id: string; status: ExecutionStatus };
type RpcOutcome = {
  status: ExecutionStatus;
  transaction: { hash: string };
  transaction_outcome: { block_hash: string; outcome: ExecutionOutcome };
  receipts_outcome: { block_hash: string; outcome: ExecutionOutcome }[];
};

/** "Smart contract panicked: Over limit" -> "Over limit". Runtime errors keep their kind. */
export function failureText(failure: unknown): string {
  const text = JSON.stringify(failure);
  const panic = /Smart contract panicked: ([^"\\]+)/.exec(text);
  if (panic) return panic[1].trim();
  const kind = /"(DelegateAction[A-Za-z]+|NotEnoughBalance|LackBalanceForState|AccountDoesNotExist|InvalidNonce|Expired)"/.exec(text);
  if (kind) return kind[1];
  const exec = /"ExecutionError":"([^"]+)"/.exec(text);
  return exec ? exec[1] : text.slice(0, 200);
}

export function parseOutcome(rpc: RpcOutcome, block: { height: number; at: number }): Outcome {
  const all = [rpc.transaction_outcome, ...rpc.receipts_outcome];
  let gasBurnt = 0n;
  let burnt = 0n;
  let failure: string | undefined;
  const events: ChainEvent[] = [];
  for (const { outcome } of all) {
    gasBurnt += BigInt(outcome.gas_burnt);
    burnt += BigInt(outcome.tokens_burnt);
    if (!failure && typeof outcome.status === "object" && outcome.status.Failure) failure = failureText(outcome.status.Failure);
    for (const log of outcome.logs) {
      if (!log.startsWith(EVENT_PREFIX)) continue;
      try {
        const parsed = JSON.parse(log.slice(EVENT_PREFIX.length)) as { standard: string; event: string; data?: unknown };
        const rows = Array.isArray(parsed.data) ? parsed.data : [parsed.data ?? {}];
        for (const data of rows) {
          events.push({ standard: parsed.standard, event: parsed.event, data: data as Record<string, unknown>, executor: outcome.executor_id, index: events.length });
        }
      } catch {
        // Not a well-formed event. Ignore it.
      }
    }
  }
  if (!failure && typeof rpc.status === "object" && rpc.status.Failure) failure = failureText(rpc.status.Failure);
  return { hash: rpc.transaction.hash, block: block.height, at: block.at, failure, gasBurnt, burnt, events };
}

// ---------------------------------------------------------------- the real chain

export type NearConfig = {
  network: string;
  rpcUrl: string;
  rpcFallbacks?: string[];
  relayerId: AccountId;
  relayerKey: KeyPairString;
};

function toNearAction(a: TxAction): Action {
  switch (a.kind) {
    case "call":
      return nearActions.functionCall(a.method, a.args, a.gas, a.deposit);
    case "transfer":
      return nearActions.transfer(a.amount);
    case "delegate":
      return nearActions.signedDelegate({
        delegateAction: a.delegate,
        signature: new Signature({ keyType: KeyType.ED25519, data: a.signature }),
      });
  }
}

const RATE_LIMITED = /\b429\b|rate limit/i;
const TRANSIENT = /\b429\b|rate limit|never been observed|UnknownBlock|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|Bad Gateway|unavailable|Internal server error|Timeout error|RetriesExceeded|Exceeded \d+ attempts/i;

/**
 * One provider over several RPC URLs. A call moves to the next URL only on a failure that says
 * nothing about the chain (rate limit, lagging node, network error), and stays there for later
 * calls; any other error is the chain's answer and is thrown as is. Sends move on only after a
 * 429, which the RPC rejected before submitting, so a transaction is never sent twice.
 * near-api-js's FailoverRpcProvider moves on after any error and wraps it, which hides real answers
 * such as "account does not exist".
 */
export function failoverProvider(urls: string[]): JsonRpcProvider {
  const providers = urls.map((url) => new JsonRpcProvider({ url }, { retries: 3, wait: 400, backoff: 2 }));
  let current = 0;
  return new Proxy(providers[0]!, {
    get(_target, prop) {
      const first = providers[current]![prop as keyof JsonRpcProvider];
      if (typeof first !== "function") return first;
      return async (...args: unknown[]) => {
        const retryable = String(prop).startsWith("send") ? RATE_LIMITED : TRANSIENT;
        let lastErr: unknown;
        for (let i = 0; i < providers.length; i++) {
          const idx = (current + i) % providers.length;
          const p = providers[idx]!;
          try {
            const result = await (p[prop as keyof JsonRpcProvider] as (...a: unknown[]) => unknown).apply(p, args);
            current = idx;
            return result;
          } catch (err) {
            const e = err as Error & { cause?: unknown };
            if (!retryable.test(`${e?.name} ${e?.message} ${e?.cause}`)) throw err;
            lastErr = err;
          }
        }
        throw lastErr;
      };
    },
  });
}

export function createNearChain(cfg: NearConfig): Chain {
  const provider = failoverProvider([cfg.rpcUrl, ...(cfg.rpcFallbacks ?? [])]);
  const relayer = new Account(cfg.relayerId, provider, KeyPairSigner.fromSecretKey(cfg.relayerKey));

  /**
   * The block a transaction landed in. Retried: the transaction is already final, and an RPC node
   * that lags or rate-limits for a moment mustn't turn a sent transaction into a failed call.
   */
  async function blockOf(hash: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        const b = await provider.viewBlock({ blockId: hash });
        return { height: Number(b.header.height), at: Math.floor(Number(b.header.timestamp_nanosec) / 1e6) };
      } catch (err) {
        if (attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }

  return {
    network: cfg.network,
    relayerId: cfg.relayerId,

    view: <T>(contract: AccountId, method: string, args: Record<string, unknown> = {}) =>
      provider.callFunction({ contractId: contract, method, args }) as Promise<T>,

    async send(receiver, actions) {
      const rpc = (await relayer.signAndSendTransaction({
        receiverId: receiver,
        actions: actions.map(toNearAction),
        waitUntil: "FINAL",
        throwOnFailure: false,
      })) as unknown as RpcOutcome;
      return parseOutcome(rpc, await blockOf(rpc.transaction_outcome.block_hash));
    },

    async balanceOf(account) {
      try {
        const a = await provider.viewAccount({ accountId: account });
        return BigInt(a.amount);
      } catch (err) {
        if (/does not exist|UNKNOWN_ACCOUNT/i.test(String((err as Error).message))) return undefined;
        throw err;
      }
    },

    async accessKeyNonce(account, key) {
      try {
        const k = await provider.viewAccessKey({ accountId: account, publicKey: key.toString() });
        return BigInt(k.nonce);
      } catch (err) {
        if (/does not exist|UNKNOWN_ACCOUNT|UNKNOWN_ACCESS_KEY|access key/i.test(String((err as Error).message))) return undefined;
        throw err;
      }
    },

    async head() {
      const b = await provider.viewBlock({ finality: "final" });
      return { height: Number(b.header.height), at: Math.floor(Number(b.header.timestamp_nanosec) / 1e6) };
    },

    async gasPrice() {
      const p = await provider.viewGasPrice();
      return BigInt(p.gas_price);
    },
  };
}

// ---------------------------------------------------------------- explorer and keys on disk

export function explorerTx(explorerUrl: string | undefined, hash: TxHash): string | undefined {
  return explorerUrl ? `${explorerUrl}/txns/${hash}` : undefined;
}

export function explorerAccount(explorerUrl: string | undefined, account: AccountId): string | undefined {
  return explorerUrl ? `${explorerUrl}/address/${account}` : undefined;
}

/** The relayer key from near-cli's credentials folder, for local development. */
export function keyFromCredentials(dir: string, network: string, account: AccountId): KeyPairString | undefined {
  const file = join(dir.replace(/^~(?=$|\/)/, homedir()), network, `${account}.json`);
  if (!existsSync(file)) return undefined;
  const json = JSON.parse(readFileSync(file, "utf8")) as { private_key?: string; secret_key?: string };
  const key = json.private_key ?? json.secret_key;
  return key?.startsWith("ed25519:") ? (key as KeyPairString) : undefined;
}
