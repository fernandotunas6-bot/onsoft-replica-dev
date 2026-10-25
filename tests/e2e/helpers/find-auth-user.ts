import type { SupabaseClient } from "@supabase/supabase-js";

/** Narrow dependency so the pagination can be exercised without network access. */
export type ListAuthUsers = SupabaseClient["auth"]["admin"]["listUsers"];

const PAGE_SIZE = 200;
const MAX_PAGES = 100;

/**
 * Search all permitted pages for a test account; never update or delete an
 * arbitrary real Auth user. A first-page-only lookup misses E2E users after
 * the staging project has accumulated more than 200 accounts.
 */
export async function findE2EAuthUserByEmail(listUsers: ListAuthUsers, email: string) {
  const target = email.trim().toLowerCase();
  if (!/^[^@\s]+@siga-plus\.test$/.test(target)) {
    throw new Error("Conta E2E inválida: só são aceites contas @siga-plus.test.");
  }

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error("Falha ao consultar utilizadores de ensaio.");
    const users = data?.users ?? [];
    const user = users.find((item) => item.email?.trim().toLowerCase() === target);
    if (user) return user;
    if (users.length < PAGE_SIZE) return null;
  }

  // Never silently conclude that a user does not exist when the scan was cut.
  throw new Error("Limite de paginação de Auth atingido; verificar staging antes de continuar.");
}
