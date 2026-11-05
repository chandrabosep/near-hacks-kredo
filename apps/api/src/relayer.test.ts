/**
 * Runs the relayer against a throwaway anvil chain with the real contracts from contracts/out.
 * Skipped when anvil or the Foundry build output is missing.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { creditVaultAbi } from "./abi/CreditVault.js";
import { mockUSDTAbi } from "./abi/MockUSDT.js";
import { createClients, type Clients } from "./chain.js";
import { openDb, type Db } from "./db.js";
import { createRelayer, RelayerError, type Relayer } from "./relayer.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../contracts/out");
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const hasAnvil = spawnSync("anvil", ["--version"]).status === 0;
const hasBuild = existsSync(join(out, "CreditVault.sol/CreditVault.json"));
const skip = !hasAnvil || !hasBuild ? "needs anvil and `forge build` in contracts/" : false;

let anvil: ChildProcess | undefined;
let clients: Clients;
let db: Db;
let relayer: Relayer;
let vault: Address;

function bytecode(name: string): Hex {
  return JSON.parse(readFileSync(join(out, `${name}.sol/${name}.json`), "utf8")).bytecode.object;
}

async function waitForRpc(url: string) {
  const client = createPublicClient({ transport: http(url) });
  for (let i = 0; i < 50; i++) {
    try {
      await client.getChainId();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("anvil did not start");
}

before(async () => {
  if (skip) return;
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const rpcUrl = `http://127.0.0.1:${port}`;
  anvil = spawn("anvil", ["--port", String(port), "--silent"], { stdio: "ignore" });
  await waitForRpc(rpcUrl);

  clients = createClients({ chainId: 31337, rpcUrl, operatorKey: ANVIL_KEY });
  const { walletClient, publicClient, operator } = clients;

  const usdtHash = await walletClient.deployContract({ abi: mockUSDTAbi, bytecode: bytecode("MockUSDT") });
  const usdt = (await publicClient.waitForTransactionReceipt({ hash: usdtHash })).contractAddress!;
  const vaultHash = await walletClient.deployContract({
    abi: creditVaultAbi,
    bytecode: bytecode("CreditVault"),
    args: [usdt, operator.address, operator.address, operator.address],
  });
  vault = (await publicClient.waitForTransactionReceipt({ hash: vaultHash })).contractAddress!;

  db = openDb(join(mkdtempSync(join(tmpdir(), "uc-relayer-")), "db.json"));
  relayer = createRelayer({ clients, db, txTimeoutMs: 10_000 });
});

after(() => {
  anvil?.kill();
});

const appAddr = (i: number) => `0x${(0xa000 + i).toString(16).padStart(40, "0")}` as Address;
const register = (i: number) =>
  relayer.write({
    address: vault,
    abi: creditVaultAbi,
    functionName: "registerApp",
    args: [appAddr(i), appAddr(100 + i), 500, 0n],
  });

test("concurrent writes go out one by one with sequential nonces", { skip }, async () => {
  const results = await Promise.all([0, 1, 2, 3, 4].map(register));

  const nonces = await Promise.all(
    results.map(async (r) => (await clients.publicClient.getTransaction({ hash: r.hash })).nonce),
  );
  for (let i = 1; i < nonces.length; i++) assert.equal(nonces[i], nonces[i - 1] + 1);

  for (const r of results) {
    assert.equal(r.tx.status, "success");
    assert.ok(r.tx.gasUsed > 0n);
    assert.ok(r.tx.l2Fee > 0n, "gas cost recorded");
  }
});

test("a call that would revert fails before sending, with the contract's error name", { skip }, async () => {
  const before = await clients.publicClient.getTransactionCount({ address: clients.operator.address });

  await assert.rejects(
    relayer.write({
      address: vault,
      abi: creditVaultAbi,
      functionName: "charge",
      args: [appAddr(200), appAddr(0), 10_000n, `0x${"01".padStart(64, "0")}`],
    }),
    (err: unknown) => err instanceof RelayerError && err.reason === "OverLimit" && err.hash === undefined,
  );

  const afterCount = await clients.publicClient.getTransactionCount({ address: clients.operator.address });
  assert.equal(afterCount, before, "nothing was sent, so no gas was spent");
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

test("spent() totals the gas of sent transactions only", { skip }, () => {
  const sent = db.data.txs.filter((t) => t.status === "success");
  const { count, wei } = relayer.spent();
  assert.equal(count, sent.length);
  assert.equal(wei, sent.reduce((sum, t) => sum + t.l2Fee + t.l1Fee, 0n));
});
