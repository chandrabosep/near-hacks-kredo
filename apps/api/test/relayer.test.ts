/** Runs the relayer against a throwaway anvil chain with the real contracts. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Address } from "viem";
import { creditVaultAbi } from "../src/abi/CreditVault.js";
import { openDb, type Db } from "../src/db.js";
import { createRelayer, RelayerError, type Relayer } from "../src/relayer.js";
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
