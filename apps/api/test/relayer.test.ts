/** Runs the relayer against a throwaway anvil chain with the real contracts. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { parseEther, parseGwei, type Address } from "viem";
import { creditVaultAbi } from "../src/abi/CreditVault.js";
import { openDb, type Db } from "../src/db.js";
import { createRelayer, RelayerError, type Relayer, type RelayerLimits } from "../src/relayer.js";
import { skipChainTests as skip, startLocalChain, type LocalChain } from "./localChain.js";

let chain: LocalChain | undefined;
let db: Db;
let relayer: Relayer;

before(async () => {
  if (skip) return;
  chain = await startLocalChain();
  db = openDb(join(mkdtempSync(join(tmpdir(), "uc-relayer-")), "db.json"));
  relayer = createRelayer({ clients: chain.clients, db, txTimeoutMs: 10_000 });
});

after(() => chain?.stop());

const appAddr = (i: number) => `0x${(0xa000 + i).toString(16).padStart(40, "0")}` as Address;
const register = (i: number) =>
  relayer.write(
    {
      address: chain!.vault,
      abi: creditVaultAbi,
      functionName: "registerApp",
      args: [appAddr(i), appAddr(100 + i), 500, 0n],
    },
    { app: appAddr(i) },
  );

test("concurrent writes go out one by one with sequential nonces", { skip }, async () => {
  const results = await Promise.all([0, 1, 2, 3, 4].map(register));

  const nonces = await Promise.all(
    results.map(async (r) => (await chain!.clients.publicClient.getTransaction({ hash: r.hash })).nonce),
  );
  for (let i = 1; i < nonces.length; i++) assert.equal(nonces[i], nonces[i - 1] + 1);

  for (const r of results) {
    assert.equal(r.tx.status, "success");
    assert.ok(r.tx.gasUsed > 0n);
    assert.ok(r.tx.l2Fee > 0n, "gas cost recorded");
  }
});

test("a call that would revert fails before sending, with the contract's error name", { skip }, async () => {
  const { publicClient, operator } = chain!.clients;
  const sentBefore = await publicClient.getTransactionCount({ address: operator.address });

  await assert.rejects(
    relayer.write({
      address: chain!.vault,
      abi: creditVaultAbi,
      functionName: "charge",
      args: [appAddr(200), appAddr(0), 10_000n, `0x${"01".padStart(64, "0")}`],
    }),
    (err: unknown) => err instanceof RelayerError && err.reason === "OverLimit" && err.hash === undefined,
  );

  const sentAfter = await publicClient.getTransactionCount({ address: operator.address });
  assert.equal(sentAfter, sentBefore, "nothing was sent, so no gas was spent");
  const last = db.data.txs.at(-1)!;
  assert.equal(last.status, "failed");
  assert.equal(last.error, "OverLimit");
  assert.equal(last.l2Fee + last.l1Fee, 0n);
});

test("the queue keeps working after a failure", { skip }, async () => {
  await assert.rejects(register(0), (err: unknown) => err instanceof RelayerError && err.reason === "AppExists");
  const r = await register(9);
  assert.equal(r.tx.status, "success");
});

test("spent() totals sent transactions, overall and per app", { skip }, () => {
  const sent = db.data.txs.filter((t) => t.status !== "failed");
  const { count, wei } = relayer.spent();
  assert.equal(count, sent.length);
  assert.equal(wei, sent.reduce((sum, t) => sum + t.l2Fee + t.l1Fee, 0n));

  const one = relayer.spent(0, appAddr(1));
  assert.equal(one.count, 1);
  assert.ok(one.wei > 0n);
});

// ---------------------------------------------------------------- limits

const roomy: RelayerLimits = {
  maxTxGas: 500_000n,
  maxGasPrice: parseGwei("50"),
  dailyBudget: parseEther("1"),
  appDailyBudget: parseEther("1"),
  minBalance: 0n,
};

function limited(overrides: Partial<RelayerLimits>) {
  const ldb = openDb(join(mkdtempSync(join(tmpdir(), "uc-limits-")), "db.json"));
  return { ldb, r: createRelayer({ clients: chain!.clients, db: ldb, txTimeoutMs: 10_000, limits: { ...roomy, ...overrides } }) };
}

const registerWith = (r: Relayer, i: number, tagApp = true) =>
  r.write(
    {
      address: chain!.vault,
      abi: creditVaultAbi,
      functionName: "registerApp",
      args: [appAddr(i), appAddr(100 + i), 500, 0n],
    },
    tagApp ? { app: appAddr(i) } : {},
  );

const refused = (reason: string) => (err: unknown) => err instanceof RelayerError && err.reason === reason && !err.hash;

async function sentCount() {
  const { publicClient, operator } = chain!.clients;
  return publicClient.getTransactionCount({ address: operator.address });
}

test("within the limits, a transaction goes out with a capped gas limit", { skip }, async () => {
  const { r } = limited({});
  const res = await registerWith(r, 20);
  const tx = await chain!.clients.publicClient.getTransaction({ hash: res.hash });
  assert.ok(tx.gas <= roomy.maxTxGas);
  assert.equal(res.tx.status, "success");
});

test("a transaction above the gas ceiling is refused before sending", { skip }, async () => {
  const { r, ldb } = limited({ maxTxGas: 21_000n });
  const before = await sentCount();
  await assert.rejects(registerWith(r, 21), refused("GasTooHigh"));
  assert.equal(await sentCount(), before);
  assert.equal(ldb.data.txs.at(-1)!.error, "GasTooHigh");
});

test("a gas price above the ceiling is refused", { skip }, async () => {
  const { r } = limited({ maxGasPrice: 1n });
  await assert.rejects(registerWith(r, 22), refused("GasPriceTooHigh"));
});

test("the daily budget stops new work but exits still go out", { skip }, async () => {
  const { r } = limited({ dailyBudget: 1n, appDailyBudget: 1n });
  await assert.rejects(registerWith(r, 23), refused("DailyBudgetReached"));

  // The operator revoking its own limit is an exit: no signature needed, and it skips the budget.
  const operator = chain!.clients.operator.address;
  const res = await r.write({
    address: chain!.vault,
    abi: creditVaultAbi,
    functionName: "revokeApp",
    args: [operator, appAddr(1), `0x${"00".repeat(32)}`, 0n, "0x"],
  });
  assert.equal(res.tx.status, "success");

  const s = await r.status();
  assert.equal(s.exitsOnly, true);
  assert.equal(s.budgetLeft, 0n);
});

test("one app's budget can't spend the whole relayer's", { skip }, async () => {
  const { r } = limited({ appDailyBudget: 1n });
  await assert.rejects(registerWith(r, 24), refused("AppBudgetReached"));
  const res = await registerWith(r, 24, false);
  assert.equal(res.tx.status, "success");
});

test("below the minimum balance, only exits go out", { skip }, async () => {
  const { r } = limited({ minBalance: parseEther("1000000") });
  await assert.rejects(registerWith(r, 25), refused("RelayerLowBalance"));
  assert.equal((await r.status()).exitsOnly, true);
});
