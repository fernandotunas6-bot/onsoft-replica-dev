import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { schoolAcceptsPublicEnrollment } from "@/features/enrollment/public-acceptance";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** Estado das candidaturas que o website da escola mostra. Nunca autoriza nada. */
export type SchoolAdmissions = {
  isOpen: boolean;
  /** Formulário oficial do SIGA (`/matricula/<slug>`); null quando encerradas. */
  path: string | null;
};

export const CLOSED_ADMISSIONS: SchoolAdmissions = { isOpen: false, path: null };

/** Página do modelo que leva ao formulário de candidatura. */
export const APPLICATION_PAGE = "/candidatura/";

export function admissionsPath(slug: string): string {
  return `/matricula/${encodeURIComponent(slug)}`;
}

/**
 * Campanha de candidaturas que o website liga ao formulário oficial.
 *
 * 1. A campanha escolhida no editor do website, se existir e estiver aberta.
 * 2. Sem escolha, a única campanha aberta da escola. Com duas ou mais abertas
 *    não se adivinha: o Administrador escolhe no editor.
 *
 * As mesmas condições do formulário `/matricula/$slug` (não apagada, aberta,
 * escola que pode receber candidaturas), para o site nunca anunciar uma
 * campanha que o formulário recusa.
 */
export async function resolveSchoolAdmissions(
  db: Db,
  schoolId: string,
  campaignSlug?: string | null,
): Promise<SchoolAdmissions> {
  let query = db
    .from("enrollment_forms")
    .select("slug")
    .eq("school_id", schoolId)
    .eq("is_open", true)
    .is("deleted_at", null);
  if (campaignSlug) query = query.eq("slug", campaignSlug);
  const { data, error } = await query.limit(2);
  if (error) throw new Error("Campaign lookup failed");
  const rows = data ?? [];
  if (rows.length !== 1 || !rows[0]?.slug) return CLOSED_ADMISSIONS;
  if (!(await schoolAcceptsPublicEnrollment(db, schoolId))) return CLOSED_ADMISSIONS;
  return { isOpen: true, path: admissionsPath(String(rows[0].slug)) };
}
