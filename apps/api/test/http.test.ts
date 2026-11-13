import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { HttpError, perIp, rateLimit, slidingWindow } from "../src/http.js";

function run(limit: ReturnType<typeof rateLimit>, method = "POST", app = "app-1") {
  const headers: Record<string, string> = {};
  const res = { locals: { app: { id: app } }, setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response;
  let error: unknown = "not called";
  limit({ method, ip: "1.2.3.4" } as Request, res, ((err?: unknown) => (error = err)) as NextFunction);
  return { error, headers };
}

test("allows the budget per API key, then answers 429 with Retry-After", () => {
  const limit = rateLimit(3);
  for (let i = 0; i < 3; i++) assert.equal(run(limit).error, undefined);

  const blocked = run(limit);
  assert.ok(blocked.error instanceof HttpError);
  assert.equal((blocked.error as HttpError).status, 429);
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);

  assert.equal(run(limit, "POST", "app-2").error, undefined, "each key has its own budget");
  assert.equal(run(limit, "GET").error, undefined, "reads are not limited");
});

test("a sliding window allows max hits, then says how long to wait", () => {
  const hit = slidingWindow(2, 60_000);
  assert.equal(hit("ip", 0), 0);
  assert.equal(hit("ip", 1_000), 0);
  assert.equal(hit("ip", 2_000), 58, "full: wait until the first hit leaves the window");
  assert.equal(hit("other", 2_000), 0, "keys are separate");
  assert.equal(hit("ip", 60_001), 0, "the first hit has left the window");
});

test("perIp answers 429 per address, not per app", () => {
  const limit = perIp(1, 3_600_000, "Too many claims from this network.");
  const call = (ip: string) => {
    const headers: Record<string, string> = {};
    let error: unknown = "not called";
    const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response;
    limit({ ip } as Request, res, ((err?: unknown) => (error = err)) as NextFunction);
    return { error, headers };
  };
  assert.equal(call("1.1.1.1").error, undefined);
  const blocked = call("1.1.1.1");
  assert.ok(blocked.error instanceof HttpError && blocked.error.status === 429);
  assert.match((blocked.error as HttpError).message, /Too many claims/);
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);
  assert.equal(call("2.2.2.2").error, undefined);
});
