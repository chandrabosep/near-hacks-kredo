import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "./config.js";

const VAULT = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const USDT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const KEY = `0x${"11".repeat(32)}`;
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function deploymentsDir(chainId: number, deployBlock = 42) {
  const dir = mkdtempSync(join(tmpdir(), "uc-deploy-"));
  writeFileSync(
    join(dir, `${chainId}.json`),
    JSON.stringify({ chainId, creditVault: VAULT, usdt: USDT, deployBlock }),
  );
  return dir;
}

test("reads addresses and start block from the deployment file", () => {
  const c = loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(31337) });
  assert.equal(c.chainId, 31337);
  assert.equal(c.vault, VAULT);
  assert.equal(c.usdt, USDT);
  assert.equal(c.startBlock, 42);
  assert.equal(c.rpcUrl, "http://127.0.0.1:8545");
  assert.equal(c.operatorKey, ANVIL_KEY);
});

test("env addresses override the deployment file", () => {
  const other = "0x0000000000000000000000000000000000000001";
  const c = loadConfig({ VAULT_ADDRESS: other, USDT_ADDRESS: USDT, DEPLOYMENTS_DIR: "/nowhere" });
  assert.equal(c.vault, other);
  assert.equal(c.startBlock, 0);
});

test("Whitechain defaults to its public RPC", () => {
  const c = loadConfig({ CHAIN_ID: "1874", OPERATOR_KEY: KEY, DEPLOYMENTS_DIR: deploymentsDir(1874) });
  assert.equal(c.rpcUrl, "https://rpc.testnet.whitechain.io");
});

test("Whitechain requires an operator key", () => {
  assert.throws(() => loadConfig({ CHAIN_ID: "1874", DEPLOYMENTS_DIR: deploymentsDir(1874) }), /OPERATOR_KEY is required/);
});

test("Whitechain refuses the public anvil key", () => {
  assert.throws(
    () => loadConfig({ CHAIN_ID: "1874", OPERATOR_KEY: ANVIL_KEY, DEPLOYMENTS_DIR: deploymentsDir(1874) }),
    /anvil test key/,
  );
});

test("rejects unknown chains and bad values", () => {
  assert.throws(() => loadConfig({ CHAIN_ID: "1" }), /CHAIN_ID/);
  assert.throws(() => loadConfig({ OPERATOR_KEY: "0x1234" }), /OPERATOR_KEY/);
  assert.throws(() => loadConfig({ VAULT_ADDRESS: "nope" }), /VAULT_ADDRESS/);
});

test("explains a missing deployment file", () => {
  assert.throws(() => loadConfig({ DEPLOYMENTS_DIR: "/nowhere" }), /Run the deploy script/);
});

test("rejects a deployment file for another chain", () => {
  const dir = mkdtempSync(join(tmpdir(), "uc-deploy-"));
  writeFileSync(join(dir, "31337.json"), JSON.stringify({ chainId: 1874, creditVault: VAULT, usdt: USDT, deployBlock: 0 }));
  assert.throws(() => loadConfig({ DEPLOYMENTS_DIR: dir }), /is for chain 1874/);
});
