import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bindToVault, openDb, pgDirFor } from "../src/db.js";
import { createStore, hashApiKey } from "../src/store.js";

const tmpDir = () => mkdtempSync(join(tmpdir(), "kredo-db-"));
const PAYOUT = "payout.kredo.testnet";

test("records and bigints survive a write and reopen", async () => {
  const dir = tmpDir();
  const db = await openDb({ dir });
  db.data.txs.push({ fn: "charge", status: "success", gasUsed: 123n, fee: 10n ** 24n, at: 1 });
  db.data.events.push({ id: "6i6ZaUXg:0", event: "Charged", block: 5, logIndex: 0, txHash: "6i6ZaUXg", at: 1_700_000_000_000, units: 2n ** 200n });
  db.data.cursor = 42;
  await db.close();

  const again = await openDb({ dir });
  assert.equal(again.data.txs[0].fee, 10n ** 24n);
  assert.equal(typeof again.data.txs[0].gasUsed, "bigint");
  assert.equal(again.data.events[0].units, 2n ** 200n, "numeric holds amounts past 64 bits");
  assert.equal(again.data.events[0].at, 1_700_000_000_000);
  assert.equal(again.data.events[0].user, undefined, "empty columns come back as missing fields");
  assert.equal(again.data.cursor, 42);
  await again.close();
});

test("a write sends changes and removals, and nothing when nothing changed", async () => {
  const dir = tmpDir();
  const db = await openDb({ dir });
  const store = createStore(db);
  const a = store.createApp({ name: "A", payout: PAYOUT, feeBps: 500 }).app;
  const b = store.createApp({ name: "B", payout: PAYOUT, feeBps: 500 }).app;
  await db.flush();

  store.setPrices(a, { "joke.tell": { credits: "1" } } as never);
  store.removeApp(b.id);
  await db.flush();
  await db.flush();
  await db.close();

  const again = await openDb({ dir });
  assert.deepEqual(again.data.apps.map((x) => x.name), ["A"]);
  assert.deepEqual(again.data.apps[0].prices, { "joke.tell": { credits: "1" } });
  await again.close();
});

test("save is debounced into one write", async () => {
  const dir = tmpDir();
  const db = await openDb({ dir, debounceMs: 10 });
  createStore(db).createApp({ name: "A", payout: PAYOUT, feeBps: 500 });
  db.save();
  await new Promise((r) => setTimeout(r, 60));
  await db.close();
  const again = await openDb({ dir });
  assert.equal(again.data.apps.length, 1);
  await again.close();
});

test("data from another network or vault is wiped", async () => {
  const db = await openDb();
  assert.equal(await bindToVault(db, "testnet:vault.kredo.testnet"), false);
  createStore(db).createApp({ name: "Video", payout: PAYOUT, feeBps: 500 });

  assert.equal(await bindToVault(db, "testnet:vault.kredo.testnet"), false, "same vault keeps data");
  assert.equal(db.data.apps.length, 1);

  assert.equal(await bindToVault(db, "mainnet:vault.kredo.near"), true);
  assert.equal(db.data.apps.length, 0);
  assert.equal(db.data.genesis, "mainnet:vault.kredo.near");
  await db.close();
});

test("one database per network and vault", () => {
  assert.equal(pgDirFor("/data", "testnet", "vault.kredo-network.testnet"), join("/data", "pg-testnet-vault-kredo-network-testnet"));
});

test("API keys are stored only as hashes", async () => {
  const db = await openDb();
  const store = createStore(db);
  const { app, apiKey } = store.createApp({ name: "Video", payout: PAYOUT, feeBps: 500 });
  await db.flush();

  assert.match(apiKey, /^uc_live_[0-9a-f]{48}$/);
  assert.equal(store.keysOf(app)[0].hash, hashApiKey(apiKey));
  assert.equal(store.appByApiKey(apiKey)?.id, app.id);
  assert.equal(store.appByApiKey(`${apiKey}x`), undefined);
  assert.match(app.id, /^app-[0-9a-f]{16}$/, "a vault app id");
  assert.equal(store.appById(app.id)?.name, "Video");
  await db.close();
});

test("hold status updates", async () => {
  const db = await openDb();
  const store = createStore(db);
  store.putHold({
    holdId: "abc",
    app: PAYOUT,
    user: PAYOUT,
    units: 800_000n,
    ref: "01",
    label: "10s video",
    expiry: 0,
    status: "open",
    txHash: "6i6ZaUXg",
  });
  assert.equal(store.openHolds().length, 1);
  store.setHoldStatus("ABC", "captured");
  assert.equal(store.openHolds().length, 0);
  assert.equal(store.hold("abc")?.status, "captured");
  await db.close();
});
