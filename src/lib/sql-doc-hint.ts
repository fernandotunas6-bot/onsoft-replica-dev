import { DOC_PATHS, getDocUrl } from "@/lib/ecosystem-urls";

/** Link canónico do checklist SQL SGA (DOC). */
export function getSqlChecklistDocUrl(): string {
  return getDocUrl(DOC_PATHS.guideSqlSga);
}

/** Sufixo curto para toasts / erros de servidor. */
export function sqlApplyHint(script: "premium" | "base" | "saas" = "premium"): string {
  const file =
    script === "base"
      ? "APPLY_IN_SQL_EDITOR.sql"
      : script === "saas"
        ? "APPLY_SAAS_PLATFORM.sql"
        : "APPLY_ENROLLMENT_AND_PREMIUM.sql";
  return `Corra supabase/${file} (ordem em DOC /guide/sql-sga).`;
}
