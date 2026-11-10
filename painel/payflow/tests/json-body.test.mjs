import assert from "node:assert/strict";
import test from "node:test";

import { readJsonBody } from "../lib/json-body.ts";

const post = (body, headers = {}) =>
  new Request("https://payflow.test/api", { method: "POST", body, headers, duplex: "half" });

test("lê JSON dentro do limite", async () => {
  assert.deepEqual(await readJsonBody(post('{"a":1}'), 64), { a: 1 });
});

test("recusa corpo acima do limite sem o ler todo", async () => {
  assert.equal(await readJsonBody(post("x".repeat(200)), 64), undefined);
  assert.equal(await readJsonBody(post("{}", { "content-length": "999999" }), 64), undefined);
});

test("recusa corpo em streaming que passa o limite", async () => {
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode('{"x":"' + "y".repeat(40)));
    },
  });
  assert.equal(await readJsonBody(post(stream), 100), undefined);
});

test("JSON inválido ou corpo vazio dão undefined, nunca excepção", async () => {
  assert.equal(await readJsonBody(post("{nao json"), 64), undefined);
  assert.equal(await readJsonBody(new Request("https://payflow.test/api"), 64), undefined);
});

test("nenhum endpoint da API lê request.json() sem limite", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const files = [];
  const stack = ["app/api"];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (p.endsWith(".ts")) files.push(p);
    }
  }
  const offenders = [];
  for (const f of files)
    if ((await readFile(f, "utf8")).includes("request.json()")) offenders.push(f);
  assert.deepEqual(offenders, []);
});
