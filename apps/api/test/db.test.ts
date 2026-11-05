import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { bindToGenesis, dbFileFor, openDb } from "../src/db.js";
import { createStore, hashApiKey } from "../src/store.js";

const tmpFile = () => join(mkdtempSync(join(tmpdir(), "uc-db-")), "db.json");
const PAYOUT = "0x00000000000000000000000000000000000000aa";

test("bigints survive a write and reload", () => {
  const file = tmpFile();
  const db = openDb(file);
  db.data.txs.push({ fn: "charge", status: "success", gasUsed: 123n, l2Fee: 10n ** 18n, l1Fee: 7n, at: 1 });
  db.flush();

  const again = openDb(file);
  assert.equal(again.data.txs[0].l2Fee, 10n ** 18n);
  assert.equal(typeof again.data.txs[0].gasUsed, "bigint");
  assert.deepEqual(readdirSync(dirname(file)), ["db.json"], "temp file is renamed away");
});

test("two processes on one file never trip over each other's temp file", () => {
  // A dev reload briefly runs the old and new server side by side on the same file.
  const file = tmpFile();
  const a = openDb(file);
  const b = openDb(file);
  for (let i = 0; i < 20; i++) {
    a.flush();
    b.flush();
  }
  assert.deepEqual(readdirSync(dirname(file)), ["db.json"]);
});

test("save is debounced into one write", async () => {
  const file = tmpFile();
  const db = openDb(file, 10);
  db.data.apps.length = 0;
  db.save();
  db.save();
  assert.equal(existsSync(file), false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(existsSync(file), true);
});

test("a new genesis wipes data from an earlier local chain", () => {
  const db = openDb(tmpFile());
  assert.equal(bindToGenesis(db, "0x01"), false);
  createStore(db).createApp({ name: "Video", payout: PAYOUT, feeBps: 500 });

  assert.equal(bindToGenesis(db, "0x01"), false, "same chain keeps data");
  assert.equal(db.data.apps.length, 1);

  assert.equal(bindToGenesis(db, "0x02"), true);
  assert.equal(db.data.apps.length, 0);
  assert.equal(db.data.genesis, "0x02");
});

test("one database file per chain and vault", () => {
  assert.equal(
    dbFileFor("/data", 1874, "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"),
    join("/data", "db-1874-e7f1725e.json"),
  );
});

test("API keys are stored only as hashes", () => {
  const file = tmpFile();
  const db = openDb(file);
  const store = createStore(db);
  const { app, apiKey } = store.createApp({ name: "Video", payout: PAYOUT, feeBps: 500 });
  db.flush();

  assert.match(apiKey, /^uc_live_[0-9a-f]{48}$/);
  assert.equal(app.apiKeyHash, hashApiKey(apiKey));
  assert.equal(readFileSync(file, "utf8").includes(apiKey), false, "raw key never written");
  assert.equal(store.appByApiKey(apiKey)?.id, app.id);
  assert.equal(store.appByApiKey(`${apiKey}x`), undefined);
  assert.equal(store.appById(app.id.toLowerCase() as `0x${string}`)?.name, "Video");
});

test("hold status updates", () => {
  const store = createStore(openDb(tmpFile()));
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
});
