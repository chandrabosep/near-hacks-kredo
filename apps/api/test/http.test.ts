import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { HttpError, rateLimit } from "../src/http.js";

function run(limit: ReturnType<typeof rateLimit>, method = "POST", app = "0xapp") {
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

  assert.equal(run(limit, "POST", "0xother").error, undefined, "each key has its own budget");
  assert.equal(run(limit, "GET").error, undefined, "reads are not limited");
});
