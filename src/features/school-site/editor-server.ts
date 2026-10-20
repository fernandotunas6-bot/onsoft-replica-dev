/**
 * CMS institucional mínimo: domínio `school_website` em school_settings.
 * A identidade escolar vem exclusivamente da sessão autenticada.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import {
  defaultSchoolSiteSettings,
  parseSchoolSiteSettings,
  schoolSitePublishInputSchema,
  schoolSiteSaveInputSchema,
  withDraft,
  withPublication,
  type SchoolSiteSettings,
} from "./schema";

const WEBSITE_DOMAIN = "school_website";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type WebsiteRow = { id: string; version: number; value: unknown };

async function readRow(db: Db, schoolId: string): Promise<WebsiteRow | null> {
  const { data, error } = await db
    .from("school_settings")
    .select("id, version, value")
    .eq("school_id", schoolId)
    .eq("domain", WEBSITE_DOMAIN)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar as configurações do website.");
  return data ? { id: data.id, version: data.version, value: data.value } : null;
}

async function readSchoolName(db: Db, schoolId: string): Promise<string> {
  const { data, error } = await db
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single();
  if (error || !data) throw new Error("Escola não encontrada.");
  return data.name;
}

/** Ler não necessita MFA; administrar só com o cargo da própria escola. */
export const getSchoolSiteEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    schoolName: string;
    version: number;
    settings: SchoolSiteSettings;
  }> => {
    const membership = await requireSgaWriterFor(
      "gestao", context.supabase, context.userId, ["Administrador"],
    );
    const db = await loadSgaAdminClient();
    const [schoolName, row] = await Promise.all([
      readSchoolName(db, membership.schoolId),
      readRow(db, membership.schoolId),
    ]);
    return {
      schoolName,
      version: row?.version ?? 0,
      settings: row ? parseSchoolSiteSettings(row.value) : defaultSchoolSiteSettings(schoolName),
    };
  });

async function saveForSchool(
  schoolId: string,
  userId: string,
  expectedVersion: number,
  transform: (current: SchoolSiteSettings) => SchoolSiteSettings,
): Promise<number> {
  const db = await loadSgaAdminClient();
  const [row, schoolName] = await Promise.all([
    readRow(db, schoolId), readSchoolName(db, schoolId),
  ]);
  const version = row?.version ?? 0;
  if (version !== expectedVersion) {
    throw new Error("O website foi alterado noutra sessão. Recarregue antes de gravar.");
  }

  const current = row
    ? parseSchoolSiteSettings(row.value)
    : defaultSchoolSiteSettings(schoolName);
  const value = transform(current);
  if (row) {
    const { data, error } = await db
      .from("school_settings")
      .update({ value, version: version + 1, changed_by: userId })
      .eq("id", row.id)
      .eq("school_id", schoolId)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();
    if (error) throw new Error("Não foi possível guardar o website.");
    if (!data) throw new Error("O website mudou noutra sessão. Recarregue e tente novamente.");
    return data.version;
  }

  const { data, error } = await db
    .from("school_settings")
    .insert({
      school_id: schoolId,
      domain: WEBSITE_DOMAIN,
      version: 1,
      value,
      changed_by: userId,
    })
    .select("version")
    .single();
  if (error || !data) {
    throw new Error("Não foi possível criar as configurações. Recarregue e tente novamente.");
  }
  return data.version;
}

/** A configuração é guardada como rascunho, nunca publicada por acidente. */
export const saveSchoolSiteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolSiteSaveInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const membership = await requireSgaWriterForWrite(
      "gestao", context.supabase, context.userId, ["Administrador"],
    );
    return {
      version: await saveForSchool(
        membership.schoolId, context.userId, data.expectedVersion,
        (settings) => withDraft(settings, data.draft),
      ),
    };
  });

/** Publicação intencional: snapshot imutável até à publicação seguinte. */
export const publishSchoolSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schoolSitePublishInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const membership = await requireSgaWriterForWrite(
      "gestao", context.supabase, context.userId, ["Administrador"],
    );
    if (data.expectedVersion === 0) {
      throw new Error("Guarde o rascunho antes de publicar.");
    }
    return {
      version: await saveForSchool(
        membership.schoolId, context.userId, data.expectedVersion,
        (settings) => withPublication(settings),
      ),
    };
  });
