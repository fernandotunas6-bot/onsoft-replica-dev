#!/usr/bin/env node
// Recusa um .env que ponha segredos dentro da app. Tudo o que vai para
// --dart-define-from-file fica legível no APK.
import { readFileSync } from "node:fs";

const allowed = new Set([
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SIGA_API_ORIGIN",
  "SIGA_GOOGLE_LOGIN",
  "SIGA_MICROSOFT_LOGIN",
  "SIGA_APPLE_LOGIN",
  "SIGA_AUTH_REDIRECT",
]);
const secretValue = [
  /^sb_secret_/,
  /service_role/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /^postgres(ql)?:\/\//i,
  /^eyJ[\w-]+\.eyJ[\w-]+\./, // JWT: as chaves antigas anon/service_role
];

export function checkEnv(text) {
  const problems = [];
  const values = {};
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) return problems.push(`linha ${index + 1}: formato CHAVE=valor`);
    const [, key, value] = match;
    if (!allowed.has(key)) problems.push(`${key}: chave não prevista (só valores públicos)`);
    if (secretValue.some((pattern) => pattern.test(value)))
      problems.push(`${key}: parece um segredo e não pode ir para a app`);
    values[key] = value;
  });
  for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SIGA_API_ORIGIN"])
    if (!values[key]) problems.push(`${key}: em falta`);
  if (
    values.SUPABASE_PUBLISHABLE_KEY &&
    !values.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
  )
    problems.push("SUPABASE_PUBLISHABLE_KEY: tem de começar por sb_publishable_");
  for (const key of ["SUPABASE_URL", "SIGA_API_ORIGIN"])
    if (values[key] && !values[key].startsWith("https://"))
      problems.push(`${key}: tem de ser https://`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? ".env";
  const problems = checkEnv(readFileSync(file, "utf8"));
  if (problems.length) {
    console.error(`${file} recusado:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${file}: só valores públicos, configuração completa.`);
}
