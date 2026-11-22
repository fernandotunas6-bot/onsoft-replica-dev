import assert from "node:assert/strict";
import test from "node:test";

import { disabledResponse, isPayflowServiceEnabled } from "../lib/service-switch.ts";

test("o PayFlow só liga com PAYFLOW_ENABLED=true ou 1", () => {
  for (const value of ["true", "TRUE", " 1 "]) {
    assert.equal(isPayflowServiceEnabled({ PAYFLOW_ENABLED: value }), true, value);
  }
  for (const value of [undefined, "", "0", "false", "yes", "on", 1, true]) {
    assert.equal(isPayflowServiceEnabled({ PAYFLOW_ENABLED: value }), false, String(value));
  }
  assert.equal(isPayflowServiceEnabled(undefined), false);
  assert.equal(isPayflowServiceEnabled(null), false);
});

test("desactivado: API responde 503 em JSON e páginas em HTML", async () => {
  const api = disabledResponse(
    new Request("https://payflow.example/api/v1/payments", { method: "POST" }),
  );
  assert.equal(api.status, 503);
  assert.match(api.headers.get("content-type") ?? "", /application\/json/);
  assert.equal((await api.json()).error.code, "payflow_disabled");

  const page = disabledResponse(new Request("https://payflow.example/checkout/abc"));
  assert.equal(page.status, 503);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /PayFlow está desactivado/);
});
