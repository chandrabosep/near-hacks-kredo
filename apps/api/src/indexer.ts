/**
 * Turns the vault's events into the database and keeps the off-chain copy honest.
 *
 * Every transaction the network sends goes through the relayer, and every one comes back with
 * its receipts' logs. The vault writes a NEP-297 event (`EVENT_JSON:{"standard":"kredo",...}`)
 * for each balance change, so the indexer reads them straight from those outcomes: no block
 * scanning, and nothing missed for anything the network sent.
 *
 * Every tick:
 *   - release holds past their expiry, so reserved credits always go back to the user
 *   - deliver signed webhooks, retrying with backoff
 *   - check the backing (the vault's USDT against everything it owes), and raise an alarm the
 *     moment it breaks
 */
import { createHmac } from "node:crypto";
import type { Config } from "./config.js";
import type { ActivityEvent, Db, WebhookDelivery } from "./db.js";
import { explorerTx, type Chain, type ChainEvent } from "./near.js";
import type { Relayer, RelayResult } from "./relayer.js";
import type { Store } from "./store.js";
import { amount } from "./units.js";
import type { Vault } from "./vault.js";

type Deps = {
  config: Pick<Config, "explorerUrl" | "indexerIntervalMs">;
  chain: Chain;
  vault: Vault;
  db: Db;
  store: Store;
  relayer: Relayer;
  now?: () => number;
};

/** The vault's event names, as the API and webhooks show them. */
const EVENT_NAMES: Record<string, string> = {
  deposited: "Deposited",
  app_registered: "AppRegistered",
  app_approved: "AppApproved",
  app_revoked: "AppRevoked",
  charged: "Charged",
  held: "Held",
  captured: "Captured",
  released: "Released",
  refunded: "Refunded",
  sent: "Sent",
  claim_created: "ClaimCreated",
  claimed: "Claimed",
  claim_cancelled: "ClaimCancelled",
  paid_out: "PaidOut",
  payout_failed: "PayoutFailed",
  fees_withdrawn: "FeesWithdrawn",
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

/** Signs a webhook body: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
export function signWebhook(secret: string, body: string, t: number): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const units = (v: unknown) => (typeof v === "string" || typeof v === "number" ? BigInt(v) : undefined);

export function createIndexer(deps: Deps) {
  const { config, chain, vault, db, store, relayer } = deps;
  const now = deps.now ?? Date.now;
  const seen = new Set(db.data.events.map((e) => e.id));

  const state = {
    head: 0,
    backed: true as boolean,
    lastBackingCheck: 0,
    lastError: undefined as string | undefined,
  };

  /** Captured and Released don't name the user or app; the hold does. */
  async function holdParties(holdId: string): Promise<{ user?: string; app?: string }> {
    const h = store.hold(holdId);
    if (h) return { user: h.user, app: h.app };
    const onchain = await vault.getHold(holdId);
    return { user: onchain?.user, app: onchain?.app };
  }

  async function toEvent(e: ChainEvent, r: RelayResult): Promise<ActivityEvent | undefined> {
    const name = EVENT_NAMES[e.event];
    if (!name) return undefined;
    const d = e.data;
    const base = { id: `${r.hash}:${e.index}`, event: name, block: r.outcome.block, logIndex: e.index, txHash: r.hash, at: r.outcome.at };
    switch (name) {
      case "Deposited":
        return { ...base, user: str(d.user), from: str(d.payer), units: units(d.amount) };
      case "AppRegistered":
        return { ...base, app: str(d.app) };
      case "AppApproved":
        return { ...base, user: str(d.user), app: str(d.app), units: units(d.limit) };
      case "AppRevoked":
        return { ...base, user: str(d.user), app: str(d.app) };
      case "Charged":
        return { ...base, user: str(d.user), app: str(d.app), units: units(d.amount), fee: units(d.fee) };
      case "Held":
        return { ...base, user: str(d.user), app: str(d.app), units: units(d.amount), holdId: str(d.hold_id) };
      case "Captured":
        return {
          ...base,
          ...(await holdParties(String(d.hold_id))),
          units: units(d.actual),
          fee: units(d.fee),
          returned: units(d.returned),
          holdId: str(d.hold_id),
        };
      case "Released":
        return { ...base, ...(await holdParties(String(d.hold_id))), units: units(d.amount), holdId: str(d.hold_id) };
      case "Refunded":
        return { ...base, user: str(d.user), app: str(d.app), units: units(d.amount) };
      case "Sent":
        return { ...base, from: str(d.from), to: str(d.to), units: units(d.amount) };
      case "ClaimCreated":
        return { ...base, from: str(d.from), units: units(d.amount), claimKey: str(d.claim_key) };
      case "Claimed":
        return { ...base, to: str(d.to), units: units(d.amount), claimKey: str(d.claim_key) };
      case "ClaimCancelled":
        return { ...base, units: units(d.amount), claimKey: str(d.claim_key) };
      case "PaidOut":
      case "PayoutFailed":
        return { ...base, app: str(d.app), to: str(d.to), units: units(d.amount) };
      case "FeesWithdrawn":
        return { ...base, to: str(d.to), units: units(d.amount) };
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
    // The body is written at the first delivery, once the route has recorded the app's ref.
    db.data.deliveries.push({ id: e.id, app: app.id, type, body: "", status: "pending", attempts: 0, nextAt: now() });
  }

  /** Stores the vault events of one relayed transaction. Returns how many were new. */
  async function ingest(r: RelayResult): Promise<number> {
    let added = 0;
    for (const ev of r.events) {
      const e = await toEvent(ev, r);
      if (!e || seen.has(e.id)) continue;
      seen.add(e.id);
      db.data.events.push(e);
      apply(e);
      queueWebhook(e);
      added++;
    }
    if (r.outcome.block > (db.data.cursor ?? 0)) db.data.cursor = r.outcome.block;
    if (added) db.save();
    return added;
  }

  // Events land as soon as the relayer has the outcome, before the route answers.
  const inflight = new Set<Promise<unknown>>();
  relayer.onResult((r) => {
    const p = ingest(r).catch((err) => console.warn(`[indexer] ${(err as Error).message}`));
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
  });

  /** Waits for every outcome handed over so far to be stored. */
  const settled = () => Promise.all([...inflight]);

  /** Releases holds past their expiry. Release is an exit, so it goes out even when the budget is spent. */
  async function sweep(): Promise<number> {
    const nowSec = Math.floor(now() / 1000);
    let released = 0;
    for (const h of store.openHolds()) {
      if (h.expiry > nowSec) continue;
      const onchain = await vault.getHold(h.holdId);
      if (!onchain || onchain.status !== "Open") {
        store.setHoldStatus(h.holdId, onchain?.status === "Captured" ? "captured" : "released");
        continue;
      }
      try {
        await relayer.write({ method: "release", args: { hold_id: h.holdId } }, { app: h.app });
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
    if (!d.body) {
      const e = db.data.events.find((x) => x.id === d.id);
      d.body = JSON.stringify({ id: d.id, type: d.type, createdAt: new Date(e?.at ?? now()).toISOString(), data: e ? present(e) : {} });
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

  /** The vault's USDT must cover everything it owes. */
  async function checkBacking() {
    const [totals, held] = await Promise.all([vault.totals(), vault.usdtBalanceOf(vault.id)]);
    const backed = held >= totals.liabilities;
    if (!backed && state.backed) console.error(`[backing] ALARM: vault holds ${held} USDT units but owes ${totals.liabilities}`);
    if (backed && !state.backed) console.log("[backing] restored");
    state.backed = backed;
    state.lastBackingCheck = now();
    return { backed, held, owed: totals.liabilities, totals };
  }

  let running: Promise<unknown> | undefined;
  let timer: NodeJS.Timeout | undefined;

  /** One full pass. Overlapping calls share the pass already running. */
  function tick() {
    running ??= (async () => {
      try {
        state.head = (await chain.head()).height;
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
      ref: op && op.app === e.app ? op.ref : undefined,
      label: op?.label,
      holdId: e.holdId,
      claimKey: e.claimKey,
      block: e.block,
      txHash: e.txHash,
      explorer: explorerTx(config.explorerUrl, e.txHash),
    };
  }

  return {
    tick,
    ingest,
    settled,
    sweep,
    deliverDue,
    checkBacking,
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
      return {
        /** Height of the newest block with events we stored. */
        block: db.data.cursor ?? 0,
        head: state.head,
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
