/**
 * Reads the vault's events into the database and keeps the off-chain copy honest.
 *
 * Every tick:
 *   - read new logs with eth_getLogs, at most `logChunk` blocks per call (Whitechain's RPC
 *     allows 1,000), and move the cursor only after a page is stored
 *   - keep hold records in step with Captured and Released events
 *   - release holds past their expiry, so reserved credits always go back to the user
 *   - deliver signed webhooks, retrying with backoff
 *   - check the backing invariant, and raise an alarm the moment it breaks
 */
import { createHmac } from "node:crypto";
import { parseEventLogs, type Address, type Chain, type Hex, type Log, type PublicClient, type Transport } from "viem";
import { creditVaultAbi } from "./abi/CreditVault.js";
import { explorerTx } from "./chain.js";
import type { Config } from "./config.js";
import type { ActivityEvent, Db, WebhookDelivery } from "./db.js";
import type { Relayer } from "./relayer.js";
import type { Store } from "./store.js";
import { amount } from "./units.js";

type Deps = {
  config: Pick<Config, "vault" | "startBlock" | "logChunk" | "indexerIntervalMs">;
  publicClient: PublicClient<Transport, Chain>;
  chain: Chain;
  db: Db;
  store: Store;
  relayer: Relayer;
  now?: () => number;
};

/** Event name to webhook type. Only app events are sent to apps. */
const WEBHOOK_TYPES: Record<string, string> = {
  Charged: "charge.succeeded",
  Held: "hold.created",
  Captured: "hold.captured",
  Released: "hold.released",
  Refunded: "refund.succeeded",
  AppApproved: "connection.approved",
  AppRevoked: "connection.revoked",
  PaidOut: "payout.paid",
};

const MAX_ATTEMPTS = 6;
const WEBHOOK_TIMEOUT_MS = 5_000;
const HOLD_OPEN = 1;
const HOLD_CAPTURED = 2;

/** Signs a webhook body: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
export function signWebhook(secret: string, body: string, t: number): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

export function createIndexer(deps: Deps) {
  const { config, publicClient, chain, db, store, relayer } = deps;
  const now = deps.now ?? Date.now;
  const seen = new Set(db.data.events.map((e) => e.id));
  const blockTimes = new Map<bigint, number>();

  const state = {
    head: 0,
    backed: true as boolean,
    lastBackingCheck: 0,
    lastError: undefined as string | undefined,
  };

  async function blockTime(n: bigint): Promise<number> {
    let t = blockTimes.get(n);
    if (t === undefined) {
      t = Number((await publicClient.getBlock({ blockNumber: n })).timestamp) * 1000;
      if (blockTimes.size > 5_000) blockTimes.clear();
      blockTimes.set(n, t);
    }
    return t;
  }

  /** Captured and Released don't name the user or app; the hold does. */
  async function holdParties(holdId: Hex): Promise<{ user?: Address; app?: Address }> {
    const h = store.hold(holdId);
    if (h) return { user: h.user, app: h.app };
    const onchain = await deps.publicClient.readContract({
      address: config.vault,
      abi: creditVaultAbi,
      functionName: "getHold",
      args: [holdId],
    });
    return { user: onchain.user, app: onchain.app };
  }

  async function toEvent(log: ReturnType<typeof parseEventLogs<typeof creditVaultAbi>>[number]): Promise<ActivityEvent | undefined> {
    const base = {
      id: `${log.transactionHash}:${log.logIndex}`,
      event: log.eventName,
      block: Number(log.blockNumber),
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      at: await blockTime(log.blockNumber),
    };
    switch (log.eventName) {
      case "Deposited":
        return { ...base, user: log.args.user, from: log.args.payer, units: log.args.amount };
      case "AppRegistered":
        return { ...base, app: log.args.app };
      case "AppApproved":
        return { ...base, user: log.args.user, app: log.args.app, units: log.args.limit };
      case "AppRevoked":
        return { ...base, user: log.args.user, app: log.args.app };
      case "Charged":
        return { ...base, user: log.args.user, app: log.args.app, units: log.args.amount, fee: log.args.fee };
      case "Held":
        return { ...base, user: log.args.user, app: log.args.app, units: log.args.amount, holdId: log.args.holdId };
      case "Captured":
        return {
          ...base,
          ...(await holdParties(log.args.holdId)),
          units: log.args.actual,
          fee: log.args.fee,
          returned: log.args.returned,
          holdId: log.args.holdId,
        };
      case "Released":
        return { ...base, ...(await holdParties(log.args.holdId)), units: log.args.amount, holdId: log.args.holdId };
      case "Refunded":
        return { ...base, user: log.args.user, app: log.args.app, units: log.args.amount };
      case "Sent":
        return { ...base, from: log.args.from, to: log.args.to, units: log.args.amount };
      case "ClaimCreated":
        return { ...base, from: log.args.from, units: log.args.amount, claimKey: log.args.claimKey };
      case "Claimed":
        return { ...base, to: log.args.to, units: log.args.amount, claimKey: log.args.claimKey };
      case "ClaimCancelled":
        return { ...base, units: log.args.amount, claimKey: log.args.claimKey };
      case "PaidOut":
        return { ...base, app: log.args.app, to: log.args.to, units: log.args.amount };
      case "FeesWithdrawn":
        return { ...base, to: log.args.to, units: log.args.amount };
      default:
        return undefined;
    }
  }

  function apply(e: ActivityEvent) {
    if (e.holdId && e.event === "Captured") store.setHoldStatus(e.holdId, "captured");
    if (e.holdId && e.event === "Released") store.setHoldStatus(e.holdId, "released");
    if (e.claimKey && e.event === "Claimed") store.setClaimStatus(e.claimKey, "claimed");
    if (e.claimKey && e.event === "ClaimCancelled") store.setClaimStatus(e.claimKey, "cancelled");
  }

  function queueWebhook(e: ActivityEvent) {
    const type = WEBHOOK_TYPES[e.event];
    const app = e.app ? store.appById(e.app) : undefined;
    if (!type || !app?.webhookUrl || !app.webhookSecret) return;
    const body = JSON.stringify({ id: e.id, type, createdAt: new Date(e.at).toISOString(), data: present(e) });
    db.data.deliveries.push({ id: e.id, app: app.id, type, body, status: "pending", attempts: 0, nextAt: now() });
  }

  /** Reads new logs, page by page. Returns how many events were stored. */
  async function scan(): Promise<number> {
    // No cache: viem otherwise reuses the block number for a few seconds.
    const head = Number(await publicClient.getBlockNumber({ cacheTime: 0 }));
    state.head = head;
    let from = (db.data.cursor ?? config.startBlock - 1) + 1;
    let added = 0;
    while (from <= head) {
      const to = Math.min(from + config.logChunk - 1, head);
      const logs: Log[] = await publicClient.getLogs({ address: config.vault, fromBlock: BigInt(from), toBlock: BigInt(to) });
      for (const log of parseEventLogs({ abi: creditVaultAbi, logs })) {
        const id = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(id)) continue;
        const e = await toEvent(log);
        if (!e) continue;
        seen.add(id);
        db.data.events.push(e);
        apply(e);
        queueWebhook(e);
        added++;
      }
      db.data.cursor = to;
      db.save();
      from = to + 1;
    }
    return added;
  }

  /** Releases holds past their expiry. Release is an exit, so it goes out even when the budget is spent. */
  async function sweep(): Promise<number> {
    const nowSec = Math.floor(now() / 1000);
    let released = 0;
    for (const h of store.openHolds()) {
      if (h.expiry > nowSec) continue;
      const onchain = await publicClient.readContract({
        address: config.vault,
        abi: creditVaultAbi,
        functionName: "getHold",
        args: [h.holdId],
      });
      if (onchain.status !== HOLD_OPEN) {
        store.setHoldStatus(h.holdId, onchain.status === HOLD_CAPTURED ? "captured" : "released");
        continue;
      }
      try {
        await relayer.write({ address: config.vault, abi: creditVaultAbi, functionName: "release", args: [h.holdId] }, { app: h.app });
        store.setHoldStatus(h.holdId, "released");
        released++;
      } catch (err) {
        console.warn(`[sweeper] could not release ${h.holdId}: ${(err as Error).message}`);
      }
    }
    return released;
  }

  async function deliver(d: WebhookDelivery) {
    const app = store.appById(d.app);
    if (!app?.webhookUrl || !app.webhookSecret) {
      d.status = "failed";
      d.lastError = "webhook removed";
      return;
    }
    d.attempts++;
    try {
      const res = await fetch(app.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-credits-event": d.type,
          "x-credits-signature": signWebhook(app.webhookSecret, d.body, Math.floor(now() / 1000)),
        },
        body: d.body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      d.lastStatus = res.status;
      d.lastError = undefined;
      if (res.ok) d.status = "delivered";
    } catch (err) {
      d.lastError = (err as Error).message;
    }
    if (d.status === "pending") {
      if (d.attempts >= MAX_ATTEMPTS) d.status = "failed";
      // 5s, 10s, 20s, 40s, 80s.
      else d.nextAt = now() + 5_000 * 2 ** (d.attempts - 1);
    }
  }

  async function deliverDue(): Promise<number> {
    const due = db.data.deliveries.filter((d) => d.status === "pending" && d.nextAt <= now());
    await Promise.all(due.map(deliver));
    if (due.length) db.save();
    // Keep the newest 1,000 finished deliveries.
    const done = db.data.deliveries.filter((d) => d.status !== "pending");
    if (done.length > 1_000) {
      const drop = new Set(done.slice(0, done.length - 1_000));
      db.data.deliveries = db.data.deliveries.filter((d) => !drop.has(d));
    }
    return due.length;
  }

  async function checkBacking() {
    const [backed, held, owed] = await publicClient.readContract({
      address: config.vault,
      abi: creditVaultAbi,
      functionName: "checkBacking",
    });
    if (!backed && state.backed) console.error(`[backing] ALARM: vault holds ${held} USDT units but owes ${owed}`);
    if (backed && !state.backed) console.log("[backing] restored");
    state.backed = backed;
    state.lastBackingCheck = now();
  }

  let running: Promise<unknown> | undefined;
  let timer: NodeJS.Timeout | undefined;

  /** One full pass. Overlapping calls share the pass already running. */
  function tick() {
    running ??= (async () => {
      try {
        await scan();
        await sweep();
        await deliverDue();
        await checkBacking();
        state.lastError = undefined;
      } catch (err) {
        state.lastError = (err as Error).message.split("\n")[0];
        console.warn(`[indexer] ${state.lastError}`);
      } finally {
        running = undefined;
      }
    })();
    return running;
  }

  /** Event rows as the API shows them. */
  function present(e: ActivityEvent) {
    const op = store.opByTx(e.txHash);
    return {
      id: e.id,
      type: e.event,
      at: new Date(e.at).toISOString(),
      user: e.user,
      app: e.app,
      appName: e.app ? store.appById(e.app)?.name : undefined,
      from: e.from,
      to: e.to,
      amount: e.units === undefined ? undefined : amount(e.units),
      fee: e.fee === undefined ? undefined : amount(e.fee),
      returned: e.returned === undefined ? undefined : amount(e.returned),
      ref: op && op.app.toLowerCase() === e.app?.toLowerCase() ? op.ref : undefined,
      label: op?.label,
      holdId: e.holdId,
      claimKey: e.claimKey,
      block: e.block,
      txHash: e.txHash,
      explorer: explorerTx(chain, e.txHash),
    };
  }

  return {
    tick,
    scan,
    sweep,
    deliverDue,
    present,

    start() {
      void tick();
      timer = setInterval(() => void tick(), config.indexerIntervalMs);
      timer.unref();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },

    status() {
      const cursor = db.data.cursor ?? config.startBlock - 1;
      return {
        block: cursor,
        head: state.head,
        lag: Math.max(0, state.head - cursor),
        backed: state.backed,
        lastBackingCheck: state.lastBackingCheck ? new Date(state.lastBackingCheck).toISOString() : null,
        events: db.data.events.length,
        pendingWebhooks: db.data.deliveries.filter((d) => d.status === "pending").length,
        error: state.lastError ?? null,
      };
    },
  };
}

export type Indexer = ReturnType<typeof createIndexer>;
