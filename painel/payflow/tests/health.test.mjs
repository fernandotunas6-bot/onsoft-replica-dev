import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checkDatabase, healthHttpStatus } from "../lib/health.ts";

const okDb = { prepare: () => ({ first: async () => ({ 1: 1 }) }) };
const brokenDb = {
  prepare: () => ({
    first: async () => {
      throw new Error("D1_ERROR: no such table");
    },
  }),
};
const hangingDb = { prepare: () => ({ first: () => new Promise(() => {}) }) };

test("database check: ok only when D1 answers SELECT 1", async () => {
  assert.equal((await checkDatabase(okDb)).status, "ok");
  assert.equal((await checkDatabase(undefined)).status, "unavailable");
  assert.equal((await checkDatabase({})).status, "unavailable");
  assert.equal((await checkDatabase(brokenDb)).status, "unavailable");
  assert.equal((await checkDatabase(hangingDb, 20)).status, "unavailable");
});

test("database check never leaks the error message", async () => {
  const result = await checkDatabase(brokenDb);
  assert.deepEqual(Object.keys(result).sort(), ["latencyMs", "status"]);
});

test("health answers 503 when a critical dependency is down", () => {
  assert.equal(healthHttpStatus({ database: { status: "ok", latencyMs: 1 } }), 200);
  assert.equal(healthHttpStatus({ database: { status: "unavailable", latencyMs: 0 } }), 503);
});

test("health route checks the database instead of always answering ok", async () => {
  const route = await readFile(new URL("../app/api/v1/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /checkDatabase\(env\.DB\)/);
  assert.match(route, /status: httpStatus/);
});
