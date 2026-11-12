#!/usr/bin/env node
/**
 * Auditoria final dos testes @live: nunca elimina escolas ou utilizadores.
 * Recusa qualquer projecto de produção e falha se detectar resíduos E2E ou
 * se não conseguir verificar todas as páginas de dados e Auth.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeE2ETarget } from "./e2e-safety.mjs";
import { getSupabaseAdmin, isE2ETenantSlug } from "./e2e-cleanup-lib.mjs";

const PAGE_SIZE = 200;
const MAX_PAGES = 100;

export function isSyntheticE2EAccount(email) {
  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();
  return /^e2e\+[^@\s]+@siga-plus\.test$/.test(normalized);
}

export function summarizeE2EResidue(tenants, authUsers) {
  if (!Array.isArray(tenants) || !Array.isArray(authUsers)) {
    throw new Error("Auditoria E2E incompleta: listas de tenants ou Auth indisponíveis.");
  }
  const schoolCount = tenants.filter((row) => isE2ETenantSlug(row?.slug)).length;
  const userCount = authUsers.filter((user) => isSyntheticE2EAccount(user?.email)).length;
  return {
    schoolCount,
    userCount,
    clean: schoolCount === 0 && userCount === 0,
  };
}

export async function readAllPages(fetchPage, label) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchPage(page, PAGE_SIZE);
    if (!result || result.error || !Array.isArray(result.data)) {
      throw new Error(`Auditoria E2E: falhou a leitura paginada de ${label}.`);
    }
    rows.push(...result.data);
    if (result.data.length < PAGE_SIZE) return rows;
  }
  throw new Error(`Auditoria E2E: limite de páginas de ${label} excedido.`);
}

export async function checkE2EStagingResidue(admin) {
  const tenants = await readAllPages(async (page, size) => {
    const { data, error } = await admin
      .from("tenants")
      .select("slug")
      .order("slug")
      .range((page - 1) * size, page * size - 1);
    return { data, error };
  }, "tenants");
  const users = await readAllPages(async (page, size) => {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: size,
    });
    return { data: data?.users, error };
  }, "utilizadores Auth");
  return summarizeE2EResidue(tenants, users);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // Nunca usar a opção excepcional de cleanup de produção para este check.
    assertSafeE2ETarget();
    const report = await checkE2EStagingResidue(getSupabaseAdmin());
    console.log(
      `Auditoria E2E: ${report.schoolCount} escola(s) sintética(s), ${report.userCount} conta(s) Auth sintética(s).`,
    );
    if (!report.clean) {
      console.error(
        "E2E bloqueado: existem resíduos de ensaio; investigar e limpar individualmente.",
      );
      process.exitCode = 1;
    } else {
      console.log("Staging sem resíduos E2E identificados.");
    }
  } catch (error) {
    // Nunca imprimir e-mails, tokens, respostas SQL ou dados de escolas.
    console.error(error instanceof Error ? error.message : "Falhou a auditoria final E2E.");
    process.exitCode = 1;
  }
}
