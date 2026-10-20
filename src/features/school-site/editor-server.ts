/**
 * Gestão autenticada do website: utiliza RLS da sessão do próprio administrador.
 * Cada alteração acrescenta versão, sem UPDATE nem service_role.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSgaWriterFor, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { requireAal2 } from "@/features/hr/require-aal2";
import { appendSchoolSiteVersion, latestSchoolSiteRow } from "./persistence";
import {
  defaultSchoolSiteSettings,
  parseSchoolSiteSettings,
  schoolSitePublishInputSchema,
  schoolSiteSaveInputSchema,
  withDraft,
  withPublication,
  type SchoolSiteSettings,
} from "./schema";

function requireSchoolAdministrator(appRole: string) {
  // As permissões por módulo podem conceder acesso extraordinário a cargos
  // não administrativos: para publicar a identidade pública não basta "gestao".
  if (appRole !== "Administrador") {
    throw new Error("A configuração do website exige o cargo de Administrador da escola.");
  }
}

export const getSchoolSiteEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      schoolName: string;
      version: number;
      settings: SchoolSiteSettings;
    }> => {
      const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
        "Administrador",
      ]);
      requireSchoolAdministrator(membership.appRole);
      const db = context.supabase;
      const [{ data: school, error }, row] = await Promise.all([
        db.from("schools").select("name").eq("id", membership.schoolId).single(),
        latestSchoolSiteRow(db, membership.schoolId),
      ]);
      if (error || !school) throw new Error("Escola não encontrada.");
      return {
        schoolName: school.name,
        version: row?.version ?? 0,
        settings: row ? parseSchoolSiteSettings(row.value) : defaultSchoolSiteSettings(school.name),
      };
    },
  );

/** Grava rascunho sem alterar a versão pública actualmente publicada. */
export const saveSchoolSiteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolSiteSaveInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    requireSchoolAdministrator(membership.appRole);
    requireAal2(context.claims, "Guardar website institucional");
    return {
      version: await appendSchoolSiteVersion(
        context.supabase,
        membership.schoolId,
        context.userId,
        data.expectedVersion,
        (settings) => withDraft(settings, data.draft),
      ),
    };
  });

/** Só um clique de publicação copia o snapshot do rascunho para visitantes. */
export const publishSchoolSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolSitePublishInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    requireSchoolAdministrator(membership.appRole);
    requireAal2(context.claims, "Publicar website institucional");
    if (data.expectedVersion === 0) {
      throw new Error("Guarde o rascunho antes de publicar.");
    }
    return {
      version: await appendSchoolSiteVersion(
        context.supabase,
        membership.schoolId,
        context.userId,
        data.expectedVersion,
        (settings) => withPublication(settings),
      ),
    };
  });
