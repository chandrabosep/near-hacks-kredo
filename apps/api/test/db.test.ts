import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bindToGenesis, dbFileFor, openDb, pgDirFor } from "../src/db.js";
import { createStore, hashApiKey } from "../src/store.js";

const tmpDir = () => mkdtempSync(join(tmpdir(), "uc-db-"));
const PAYOUT = "0x00000000000000000000000000000000000000aa";

test("records and bigints survive a write and reopen", async () => {
  const dir = tmpDir();
  const db = await openDb({ dir });
  db.data.txs.push({ fn: "charge", status: "success", gasUsed: 123n, l2Fee: 10n ** 18n, l1Fee: 7n, at: 1 });
  db.data.events.push({ id: "0x01:0", event: "Charged", block: 5, logIndex: 0, txHash: "0x01", at: 1_700_000_000_000, units: 2n ** 200n });
  db.data.cursor = 42;
  await db.close();

  const again = await openDb({ dir });
  assert.equal(again.data.txs[0].l2Fee, 10n ** 18n);
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

test("a new genesis wipes data from an earlier local chain", async () => {
  const db = await openDb();
  assert.equal(await bindToGenesis(db, "0x01"), false);
  createStore(db).createApp({ name: "Video", payout: PAYOUT, feeBps: 500 });

  assert.equal(await bindToGenesis(db, "0x01"), false, "same chain keeps data");
  assert.equal(db.data.apps.length, 1);

  assert.equal(await bindToGenesis(db, "0x02"), true);
  assert.equal(db.data.apps.length, 0);
  assert.equal(db.data.genesis, "0x02");
  await db.close();
});

test("an older JSON data file is imported once", async () => {
  const dir = tmpDir();
  const legacyFile = join(dir, "db.json");
  writeFileSync(legacyFile, JSON.stringify({ apps: [], users: [{ privyId: "did:privy:1", address: PAYOUT, createdAt: 1 }], txs: [{ fn: "charge", status: "success", gasUsed: { $bigint: "9" }, l2Fee: { $bigint: "1" }, l1Fee: { $bigint: "0" }, at: 1 }], cursor: 7 }));
  const db = await openDb({ dir: join(dir, "pg"), legacyFile });
  assert.equal(db.data.users[0].privyId, "did:privy:1");
  assert.equal(db.data.txs[0].gasUsed, 9n);
  assert.equal(db.data.cursor, 7);
  await db.close();
});

test("one database per chain and vault", () => {
  const vault = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  assert.equal(dbFileFor("/data", 1874, vault), join("/data", "db-1874-e7f1725e.json"));
  assert.equal(pgDirFor("/data", 1874, vault), join("/data", "pg-1874-e7f1725e"));
});

test("API keys are stored only as hashes", async () => {
  const db = await openDb();
  const store = createStore(db);
  const { app, apiKey } = store.createApp({ name: "Video", payout: PAYOUT, feeBps: 500 });
  await db.flush();

  assert.match(apiKey, /^uc_live_[0-9a-f]{48}$/);
  assert.equal(app.apiKeyHash, hashApiKey(apiKey));
  assert.equal(store.appByApiKey(apiKey)?.id, app.id);
  assert.equal(store.appByApiKey(`${apiKey}x`), undefined);
  assert.equal(store.appById(app.id.toLowerCase() as `0x${string}`)?.name, "Video");
  await db.close();
});

test("hold status updates", async () => {
  const db = await openDb();
  const store = createStore(db);
  store.putHold({
    holdId: "0xabc",
    app: PAYOUT,
    user: PAYOUT,
    units: 800_000n,
    ref: "0x01",
    label: "10s video",
    expiry: 0,
    status: "open",
    txHash: "0x02",
  });
  assert.equal(store.openHolds().length, 1);
  store.setHoldStatus("0xABC", "captured");
  assert.equal(store.openHolds().length, 0);
  assert.equal(store.hold("0xabc")?.status, "captured");
  await db.close();
});
