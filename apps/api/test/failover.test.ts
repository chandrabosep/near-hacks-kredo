import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { failoverProvider } from "../src/near.js";

const servers: Server[] = [];
after(() => servers.forEach((s) => s.close()));

/** A JSON-RPC server that answers every call with `reply`, and counts the calls. */
async function rpc(reply: (method: string) => { status?: number; body: unknown }) {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const { id, method } = JSON.parse(raw);
      calls.push(method);
      const { status = 200, body } = reply(method);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(status === 200 ? { jsonrpc: "2.0", id, ...(body as object) } : body));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls };
}

const gasPrice = { result: { gas_price: "100000000" } };
const rateLimited = { status: 429, body: { error: { code: -429, message: "Rate limits exceeded" } } };

test("moves to the next RPC on a 429, and stays there", async () => {
  const limited = await rpc(() => rateLimited);
  const ok = await rpc(() => ({ body: gasPrice }));
  const p = failoverProvider([limited.url, ok.url]);

  assert.equal((await p.viewGasPrice()).gas_price, "100000000");
  await p.viewGasPrice();
  assert.equal(ok.calls.length, 2);
  assert.ok(limited.calls.length > 0);
  const before = limited.calls.length;
  await p.viewGasPrice();
  assert.equal(limited.calls.length, before, "a later call goes straight to the RPC that worked");
});

test("moves on when a node hasn't seen the block", async () => {
  const lagging = await rpc(() => ({
    body: { error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_BLOCK", info: {} }, code: -32000, message: "Server error", data: "Block either has never been observed on the node or has been garbage collected" } },
  }));
  const ok = await rpc(() => ({ body: gasPrice }));
  const p = failoverProvider([lagging.url, ok.url]);
  assert.equal((await p.viewGasPrice()).gas_price, "100000000");
});

test("throws the chain's own answer without trying another RPC", async () => {
  const first = await rpc(() => ({
    body: { error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: {} }, code: -32000, message: "Server error", data: "account nobody.testnet does not exist while viewing" } },
  }));
  const second = await rpc(() => ({ body: { result: {} } }));
  const p = failoverProvider([first.url, second.url]);
  await assert.rejects(p.viewAccount({ accountId: "nobody.testnet" }), /does not exist/);
  assert.equal(second.calls.length, 0);
});
