/**
 * Activa websites de escola APENAS após aplicar e validar a migração
 * 20261020213000_school_website_draft_read_guard.sql em staging e produção.
 *
 * Opt-in explícito no Worker. Sem flag, não lê settings nem grava rascunhos.
 * A flag impede que um deploy de código anterior à migração exponha drafts
 * a alunos ou encarregados com SELECT em school_settings.
 */
export function schoolSitesEnabled(): boolean {
  return process.env["SCHOOL_SITES_ENABLED"] === "true";
}

export function requireSchoolSitesEnabled(): void {
  if (!schoolSitesEnabled()) {
    throw new Error(
      "Websites institucionais ainda não estão activados. A segurança dos rascunhos deve ser validada primeiro.",
    );
  }
}
