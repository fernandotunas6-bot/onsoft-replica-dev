/**
 * Persistência do website com as políticas RLS da própria sessão.
 *
 * A restrição real de school_settings é UNIQUE(school_id, domain, version),
 * NÃO UNIQUE(school_id, domain). Uma versão é um registo imutável e a leitura
 * selecciona explicitamente a versão maior. Isso evita sobrescrita e permite
 * resolver concorrência sem usar service_role.
 */
import type { SupabaseAuthContext } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  defaultSchoolSiteSettings,
  parseSchoolSiteSettings,
  type SchoolSiteSettings,
} from "./schema";

type Db = SupabaseAuthContext["supabase"];

const SCHOOL_WEBSITE_DOMAIN = "school_website";
const CONFLICT = "O website mudou noutra sessão. Recarregue e tente novamente.";

export async function latestSchoolSiteRow(db: Db, schoolId: string) {
  const { data, error } = await db
    .from("school_settings")
    .select("id, version, value")
    .eq("school_id", schoolId)
    .eq("domain", SCHOOL_WEBSITE_DOMAIN)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar as configurações do website.");
  return data;
}

async function schoolName(db: Db, schoolId: string): Promise<string> {
  const { data, error } = await db.from("schools").select("name").eq("id", schoolId).single();
  if (error || !data) throw new Error("Escola não encontrada.");
  return data.name;
}

/**
 * Inserção versionada:
 * - o esperado é a versão maior actualmente visível para ESTA escola;
 * - duas inserções com mesmo version colidem na UNIQUE da base;
 * - a política INSERT exige 2FA, permissão schools.settings.create e
 *   changed_by = auth.uid() no JWT autenticado;
 * - não modifica outras escolas, versões anteriores nem serviço público.
 */
export async function appendSchoolSiteVersion(
  db: Db,
  schoolId: string,
  userId: string,
  expectedVersion: number,
  transform: (current: SchoolSiteSettings) => SchoolSiteSettings,
): Promise<number> {
  const [row, name] = await Promise.all([
    latestSchoolSiteRow(db, schoolId),
    schoolName(db, schoolId),
  ]);
  const version = row?.version ?? 0;
  if (version !== expectedVersion) throw new Error(CONFLICT);
  const current = row
    ? parseSchoolSiteSettings(row.value)
    : defaultSchoolSiteSettings(name);
  const next = transform(current);

  const { data, error } = await db
    .from("school_settings")
    .insert({
      school_id: schoolId,
      domain: SCHOOL_WEBSITE_DOMAIN,
      version: version + 1,
      changed_by: userId,
      value: next as unknown as Json,
    })
    .select("version")
    .single();

  if (error?.code === "23505") throw new Error(CONFLICT);
  if (error || !data) {
    throw new Error("Não foi possível guardar o website. Confirme as permissões e o 2FA.");
  }
  return data.version;
}
