#!/usr/bin/env node
/** Regressão HTTP do Worker compilado; sem sessão, escritas ou serviços remotos. */
const base = new URL(process.env.SIGA_BUILT_WORKER_URL ?? "http://127.0.0.1:8787");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error("Este ensaio exige um Worker local.");

const response = await fetch(new URL("/api/mobile/absences", base), {
  method: "GET",
  redirect: "manual",
  signal: AbortSignal.timeout(15_000),
});
if (response.status !== 401) {
  await response.body?.cancel();
  throw new Error(`Faltas: HTTP ${response.status}; esperado 401 no Worker compilado.`);
}
const body = await response.json();
if (body?.error !== "SESSION_INVALID") throw new Error("Contrato de sessão inválida inesperado.");
console.log("OK — Worker compilado: faltas recusam sessão ausente (401/SESSION_INVALID).");
