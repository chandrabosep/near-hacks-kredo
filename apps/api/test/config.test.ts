import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KeyPair } from "near-api-js";
import { loadConfig } from "../src/config.js";

const KEY = KeyPair.fromRandom("ed25519").toString();

function deploymentsDir(network = "testnet", d: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kredo-deploy-"));
  writeFileSync(
    join(dir, `${network}.json`),
    JSON.stringify({ network, vault: "vault.kredo.testnet", usdt: "usdt.kredo.testnet", operator: "relayer.kredo.testnet", ...d }),
  );
  return dir;
}

test("reads the vault, USDT and relayer accounts from the deployment file", () => {
  const c = loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: KEY });
  assert.equal(c.network, "testnet");
  assert.equal(c.vault, "vault.kredo.testnet");
  assert.equal(c.usdt, "usdt.kredo.testnet");
  assert.equal(c.relayerId, "relayer.kredo.testnet");
  assert.equal(c.rpcUrl, "https://test.rpc.fastnear.com");
  assert.equal(c.explorerUrl, "https://testnet.nearblocks.io");
});

test("env accounts and RPC override the defaults", () => {
  const c = loadConfig({
    VAULT_ACCOUNT_ID: "Vault.Other.testnet",
    USDT_ACCOUNT_ID: "usdt.other.testnet",
    RELAYER_ACCOUNT_ID: "relayer.other.testnet",
    RELAYER_PRIVATE_KEY: KEY,
    NEAR_RPC_URL: "https://rpc.example",
    EXPLORER_URL: "https://explorer.example/",
    DEPLOYMENTS_DIR: "/nowhere",
  });
  assert.equal(c.vault, "vault.other.testnet", "account IDs are lowercased");
  assert.equal(c.rpcUrl, "https://rpc.example");
  assert.equal(c.explorerUrl, "https://explorer.example");
});

test("reads the relayer key from near-cli's credentials folder", () => {
  const creds = mkdtempSync(join(tmpdir(), "kredo-creds-"));
  mkdirSync(join(creds, "testnet"));
  writeFileSync(join(creds, "testnet", "relayer.kredo.testnet.json"), JSON.stringify({ account_id: "relayer.kredo.testnet", private_key: KEY }));
  const c = loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), NEAR_CREDENTIALS_DIR: creds });
  assert.equal(c.relayerKey, KEY);
});

test("explains a missing relayer key", () => {
  assert.throws(() => loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), NEAR_CREDENTIALS_DIR: "/nowhere" }), /RELAYER_PRIVATE_KEY/);
});

test("rejects bad account IDs and keys", () => {
  assert.throws(() => loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: KEY, VAULT_ACCOUNT_ID: "Not An Account!" }), /NEAR account ID/);
  assert.throws(() => loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: "0x1234" }), /ed25519/);
});

test("explains a missing deployment file", () => {
  assert.throws(() => loadConfig({ DEPLOYMENTS_DIR: "/nowhere", RELAYER_PRIVATE_KEY: KEY }), /No deployment found/);
});

test("rejects a deployment file for another network", () => {
  const dir = deploymentsDir("testnet", { network: "mainnet" });
  assert.throws(() => loadConfig({ DEPLOYMENTS_DIR: dir, RELAYER_PRIVATE_KEY: KEY }), /is for mainnet/);
});

test("relayer limits default to safe values and read NEAR amounts", () => {
  const c = loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: KEY });
  assert.equal(c.relayerLimits.dailyBudget, 10n ** 24n);
  assert.equal(c.relayerLimits.maxTxGas, 300n * 10n ** 12n);
  assert.equal(c.userAccountYocto, 10n ** 22n);

  const custom = loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: KEY, RELAYER_DAILY_BUDGET: "2", APP_DAILY_GAS_BUDGET: "0.5" });
  assert.equal(custom.relayerLimits.dailyBudget, 2n * 10n ** 24n);
  assert.equal(custom.relayerLimits.appDailyBudget, 5n * 10n ** 23n);
});

test("an app budget above the relayer budget is refused", () => {
  const base = { DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: KEY };
  assert.throws(() => loadConfig({ ...base, RELAYER_DAILY_BUDGET: "0.1", APP_DAILY_GAS_BUDGET: "0.2" }), /APP_DAILY_GAS_BUDGET/);
  assert.throws(() => loadConfig({ ...base, RELAYER_DAILY_BUDGET: "abc" }), /NEAR amount/);
});

test("the faucet amount is read in USDT units", () => {
  const c = loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: KEY, FAUCET_USDT: "1.25" });
  assert.equal(c.faucet?.units, 1_250_000n);
  assert.equal(loadConfig({ DEPLOYMENTS_DIR: deploymentsDir(), RELAYER_PRIVATE_KEY: KEY, FAUCET_USDT: "0" }).faucet, undefined);
});
