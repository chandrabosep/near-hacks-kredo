/** Runs the relayer against the in-memory NEAR chain with the vault's rules. */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { openDb, type Db } from "../src/db.js";
import { parseOutcome } from "../src/near.js";
import { createRelayer, reasonCode, RelayerError, transient, type Relayer, type RelayerLimits } from "../src/relayer.js";
import { createFakeChain, type FakeChain } from "./fakeChain.js";

let chain: FakeChain;
let db: Db;
let relayer: Relayer;

before(async () => {
  chain = createFakeChain();
  db = await openDb();
  relayer = createRelayer({ chain, db, vault: chain.vault });
  // The vault takes each new app's state from the caller's storage balance: the relayer's.
  await relayer.write({ method: "storage_deposit", args: { account_id: chain.relayerId }, deposit: 10n ** 23n });
});

const register = (i: number) =>
  relayer.write({ method: "register_app", args: { app: `app-${i}`, payout: "payout.testnet", signer: `app-${i}.apps.testnet`, fee_bps: 500, max_charge: null } }, { app: `app-${i}` });

test("concurrent writes go out one by one, and each records what it burnt", async () => {
  const results = await Promise.all([0, 1, 2, 3, 4].map(register));
  const blocks = results.map((r) => r.outcome.block);
  for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i] > blocks[i - 1], "in queue order");
  for (const r of results) {
    assert.equal(r.tx.status, "success");
    assert.ok(r.tx.gasUsed > 0n);
    assert.ok(r.tx.fee > 0n, "NEAR burnt is recorded");
    assert.equal(r.events[0].event, "app_registered");
  }
});

test("a contract panic becomes a RelayerError named after it, and the gas is still recorded", async () => {
  // The relayer is an operator, and operators can't charge: only the app's own signer can.
  await assert.rejects(
    relayer.write({ method: "charge", args: { user: "alice.testnet", app: "app-0", amount: "10000", ref_id: "r1" } }),
    (err: unknown) => err instanceof RelayerError && err.reason === "NotAppSigner" && !!err.hash,
  );
  const last = db.data.txs.at(-1)!;
  assert.equal(last.status, "reverted");
  assert.equal(last.error, "Not app signer");
  assert.ok(last.fee > 0n);
});

test("a failed write doesn't block the queue", async () => {
  const [bad, good] = await Promise.allSettled([register(0), register(10)]);
  assert.equal(bad.status, "rejected");
  assert.equal((bad as PromiseRejectedResult).reason.reason, "AppExists");
  assert.equal(good.status, "fulfilled");
});

test("only the vault's own kredo events are handed back", async () => {
  const r = await register(11);
  assert.ok(r.events.every((e) => e.executor === chain.vault && e.standard === "kredo"));
});

test("panics and runtime errors map to error codes", () => {
  assert.equal(reasonCode("Over limit"), "OverLimit");
  assert.equal(reasonCode("Insufficient balance"), "InsufficientBalance");
  assert.equal(reasonCode("Paused"), "EnforcedPause");
  assert.equal(reasonCode("DelegateActionExpired"), "SignatureExpired");
  assert.equal(reasonCode("DelegateActionInvalidNonce"), "NonceUsed");
});

test("outcomes are parsed: every receipt's burn, the first failure, and NEP-297 events", () => {
  const o = parseOutcome(
    {
      status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: Ref used" } } } } },
      transaction: { hash: "Tx1" },
      transaction_outcome: { block_hash: "B", outcome: { logs: [], gas_burnt: 100, tokens_burnt: "10", executor_id: "relayer.testnet", status: { SuccessReceiptId: "R" } } },
      receipts_outcome: [
        {
          block_hash: "B",
          outcome: {
            logs: ['EVENT_JSON:{"standard":"kredo","version":"1.0.0","event":"charged","data":[{"user":"a.testnet","amount":"5"}]}', "plain log"],
            gas_burnt: 200,
            tokens_burnt: "20",
            executor_id: "vault.testnet",
            status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: Ref used" } } } } },
          },
        },
      ],
    },
    { height: 7, at: 1 },
  );
  assert.equal(o.gasBurnt, 300n);
  assert.equal(o.burnt, 30n);
  assert.equal(o.failure, "Ref used");
  assert.deepEqual(o.events.map((e) => [e.event, e.executor, e.data.amount]), [["charged", "vault.testnet", "5"]]);
});

test("only network trouble is retried", () => {
  assert.ok(transient(new Error("fetch failed")));
  assert.ok(transient(new Error("503 Service Unavailable")));
  assert.ok(!transient(new Error("Smart contract panicked: Over limit")));
});

// ---------------------------------------------------------------- limits

async function limited(limits: RelayerLimits) {
  return createRelayer({ chain, db: await openDb(), vault: chain.vault, limits });
}

const ONE_NEAR = 10n ** 24n;
const roomy: RelayerLimits = { maxTxGas: 300n * 10n ** 12n, dailyBudget: ONE_NEAR, appDailyBudget: ONE_NEAR, minBalance: 0n };

test("too much gas is refused before sending", async () => {
  const r = await limited({ ...roomy, maxTxGas: 10n ** 12n });
  const sent = chain.sent.length;
  await assert.rejects(register(20).then(() => r.write({ method: "set_app_active", args: { app: "app-20", active: false } })), (e: unknown) => e instanceof RelayerError && e.reason === "GasTooHigh");
  assert.equal(chain.sent.length, sent + 1, "only the unlimited register went out");
});

test("the daily budget stops spending but never exits", async () => {
  const r = await limited({ ...roomy, dailyBudget: 1n, appDailyBudget: 1n });
  await assert.rejects(r.write({ method: "set_app_active", args: { app: "app-0", active: true } }), (e: unknown) => e instanceof RelayerError && e.reason === "DailyBudgetReached");
  // A release is an exit: it goes out whatever the budget says (and fails onchain here, as there is no hold).
  await assert.rejects(r.write({ method: "release", args: { hold_id: "none" } }), (e: unknown) => e instanceof RelayerError && e.reason === "HoldNotOpen");
});

test("below the balance floor, only exits go out", async () => {
  const r = await limited({ ...roomy, minBalance: 1_000n * ONE_NEAR });
  await assert.rejects(r.write({ method: "set_app_active", args: { app: "app-0", active: true } }), (e: unknown) => e instanceof RelayerError && e.reason === "RelayerLowBalance");
  const s = await r.status();
  assert.equal(s.exitsOnly, true);
});

test("an app's own budget is separate", async () => {
  const r = await limited({ ...roomy, appDailyBudget: 1n });
  await assert.rejects(r.write({ method: "set_app_active", args: { app: "app-0", active: true } }, { app: "app-0" }), (e: unknown) => e instanceof RelayerError && e.reason === "AppBudgetReached");
  await r.write({ method: "set_app_active", args: { app: "app-0", active: true } });
});
