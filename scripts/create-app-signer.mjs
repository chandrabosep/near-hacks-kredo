#!/usr/bin/env node
/**
 * Creates an app's signer account: `<app id>.<apps parent>`, in one transaction, holding a single
 * function-call key that can only call `charge`, `hold`, `capture`, `release` and `refund` on the
 * vault. No full-access key is ever added, so neither Kredo nor the company can add keys to it
 * later, and a leaked key can't move NEAR or call anything else. Its key pair is generated here and
 * printed once, for the app's server (CREDITS_SIGNER_KEY).
 *
 * Signs as the apps parent with its key from near-cli's legacy keychain.
 *
 *   node scripts/create-app-signer.mjs <app id>               # prints CREDITS_SIGNER_KEY=...
 *   node scripts/create-app-signer.mjs <app id> --env demos/parley/.env.local
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// near-api-js is a dependency of the API workspace.
const require = createRequire(join(root, "apps/api/package.json"));
const { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } = require("near-api-js");

const METHODS = ["charge", "hold", "capture", "release", "refund"];
/** NEAR the new account keeps for its own storage (one account record and one key). */
const ACCOUNT_BALANCE = 10n ** 22n * 2n; // 0.02 NEAR
/** Gas the key may spend if the app ever sends its own transactions. Relayed ones don't use it. */
const KEY_ALLOWANCE = 10n ** 23n * 2n; // 0.2 NEAR

const [appId, ...rest] = process.argv.slice(2);
if (!appId || !/^app-[0-9a-f]{16}$/.test(appId)) {
  console.error("usage: create-app-signer.mjs <app id like app-0123456789abcdef> [--env <file>]");
  process.exit(1);
}
const envIdx = rest.indexOf("--env");
const envFile = envIdx >= 0 ? rest[envIdx + 1] : undefined;

const deployment = JSON.parse(readFileSync(join(root, "contracts/deployments/testnet.json"), "utf8"));
const parent = process.env.APPS_PARENT ?? deployment.appsParent;
const vault = process.env.VAULT ?? deployment.vault;
if (!parent) throw new Error("No apps parent: set APPS_PARENT or appsParent in contracts/deployments/testnet.json");

const credFile = join(homedir(), ".near-credentials", "testnet", `${parent}.json`);
if (!existsSync(credFile)) throw new Error(`No key for ${parent} at ${credFile}`);
const parentKey = JSON.parse(readFileSync(credFile, "utf8")).private_key;

const provider = new JsonRpcProvider({ url: deployment.rpc ?? "https://test.rpc.fastnear.com" });
const signerAccount = `${appId}.${parent}`;
const key = KeyPair.fromRandom("ed25519");

const account = new Account(parent, provider, KeyPairSigner.fromSecretKey(parentKey));
const outcome = await account.signAndSendTransaction({
  receiverId: signerAccount,
  actions: [
    actions.createAccount(),
    actions.transfer(ACCOUNT_BALANCE),
    actions.addFunctionCallAccessKey(key.getPublicKey(), vault, METHODS, KEY_ALLOWANCE),
  ],
  waitUntil: "FINAL",
});
const hash = outcome.transaction_outcome?.id ?? outcome.transaction?.hash;

console.error(`created ${signerAccount}: one function-call key for ${METHODS.join(", ")} on ${vault}`);
console.error(`tx ${deployment.explorer ?? "https://testnet.nearblocks.io"}/txns/${hash}`);
if (envFile) {
  const path = resolve(root, envFile);
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((l) => l && !l.startsWith("CREDITS_SIGNER_KEY=")) : [];
  writeFileSync(path, [...lines, `CREDITS_SIGNER_KEY=${key.toString()}`, ""].join("\n"));
  console.error(`wrote CREDITS_SIGNER_KEY to ${envFile}`);
} else {
  console.log(`CREDITS_SIGNER_KEY=${key.toString()}`);
}
