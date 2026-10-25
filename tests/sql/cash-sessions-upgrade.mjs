// Ensaio local (PGlite) de 20261025110000_cash_sessions_upgrade_to_final.sql. Sem produção.
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/cash-sessions-upgrade.mjs
//
// A produção tem a 20261024110000 da primeira versão (commit 8154da88, guardada em
// fixtures/). Aqui: essa versão, depois a actualização duas vezes, e todos os casos de
// cash-sessions.mjs — gateway pelo external_id, despesa por aprovar, depósitos.
globalThis.SIGA_CASH_SESSIONS_MIGRATIONS = [
  "./fixtures/20261024110000_finance_cash_sessions_v1_8154da88.sql",
  "../../supabase/migrations/20261025110000_cash_sessions_upgrade_to_final.sql",
  "../../supabase/migrations/20261025110000_cash_sessions_upgrade_to_final.sql",
];
await import("./cash-sessions.mjs");
