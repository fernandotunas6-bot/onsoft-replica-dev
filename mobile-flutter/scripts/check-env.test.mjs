import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkEnv } from "./check-env.mjs";

const ok = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

test(".env.example só tem valores públicos e está completo", () => {
  assert.deepEqual(checkEnv(ok), []);
});

test("recusa segredos e chaves não previstas", () => {
  const bad = `${ok}
SUPABASE_SERVICE_ROLE_KEY=sb_secret_abc
GMAIL_APP_PASSWORD=abcd efgh
DATABASE_URL=postgresql://postgres:senha@db.example/postgres`;
  const problems = checkEnv(bad).join("\n");
  assert.match(problems, /SUPABASE_SERVICE_ROLE_KEY: chave não prevista/);
  assert.match(problems, /parece um segredo/);
  assert.match(problems, /GMAIL_APP_PASSWORD: chave não prevista/);
  assert.match(problems, /DATABASE_URL/);
});

test("exige HTTPS e a chave publicável", () => {
  const problems = checkEnv(
    "SUPABASE_URL=http://x\nSUPABASE_PUBLISHABLE_KEY=eyJa.eyJb.c\nSIGA_API_ORIGIN=https://m.portal-siga.com",
  ).join("\n");
  assert.match(problems, /SUPABASE_URL: tem de ser https/);
  assert.match(problems, /sb_publishable_/);
});
