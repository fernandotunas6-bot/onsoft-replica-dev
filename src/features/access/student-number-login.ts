/**
 * Entrar com o número de aluno (1 + ano + 4 dígitos, ex.: 1260001).
 *
 * Cada escola decide (Definições → Segurança): domínio `student_access` de
 * `school_settings`, `student_number_login`, desligado por omissão. O número só
 * é único dentro da escola — todas começam no 1260001 — por isso a escola tem de
 * vir do endereço (`escola.portal-siga.com` ou domínio próprio). No endereço
 * geral só se entra quando o número existe numa única escola com a opção ligada;
 * havendo mais, pede-se o endereço da escola em vez de escolher ao acaso.
 *
 * Como no login por B.I.: o e-mail da conta nunca sai do servidor, a senha é a
 * da conta e um número desconhecido dá a mesma resposta que uma senha errada.
 * Só contam fichas de aluno activas (ou candidatas) ligadas a uma conta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantLookup } from "@/lib/saas/tenant-resolver";
import { parseSettingsDomain } from "@/features/school/settings-domains";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export const STUDENT_ACCESS_DOMAIN = "student_access";
const STUDENT_NUMBER = /^1\d{6}$/;
/** Estados de aluno que podem entrar (candidato: acabou de ser registado). */
const LOGIN_STATUSES = ["active", "applicant"];

/** O número limpo («126 0001», «126-0001» → «1260001»), ou null se não é um. */
export function normalizeStudentNumber(raw: string): string | null {
  const compact = raw.replace(/[\s.-]/g, "");
  return STUDENT_NUMBER.test(compact) ? compact : null;
}

type Db = Pick<SupabaseClient, "from"> & {
  auth: { admin: { getUserById: SupabaseClient["auth"]["admin"]["getUserById"] } };
};

/** Escola do endereço: subdomínio da plataforma ou domínio próprio activo. */
export async function schoolIdForHost(db: Db, hostname: string | null | undefined) {
  if (!hostname) return null;
  const lookup = resolveTenantLookup(hostname.split(":")[0]);
  let tenantId: string | null = null;
  if (lookup.mode === "slug") {
    if (["minha-escola", "admin", "app", "www"].includes(lookup.slug)) return null;
    const { data } = await db.from("tenants").select("id").eq("slug", lookup.slug).maybeSingle();
    tenantId = (data as { id?: string } | null)?.id ?? null;
  } else if (lookup.hostname) {
    const { data } = await db
      .from("tenant_domains")
      .select("tenant_id")
      .eq("hostname", lookup.hostname)
      .eq("status", "active")
      .maybeSingle();
    tenantId = (data as { tenant_id?: string } | null)?.tenant_id ?? null;
  }
  if (!tenantId) return null;
  const { data: school } = await db
    .from("schools")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (school as { id?: string } | null)?.id ?? null;
}

export type StudentNumberLogin =
  | { email: string }
  | { error: "school_required" }
  /** Nenhuma ficha com conta e opção ligada: segue o caminho do B.I./telefone. */
  | null;

export async function resolveStudentNumberLogin(
  db: Db,
  studentNumber: string,
  hostSchoolId: string | null,
): Promise<StudentNumberLogin> {
  let query = db
    .from("students")
    .select("school_id, person_id")
    .eq("student_number", studentNumber)
    .in("status", LOGIN_STATUSES)
    .is("deleted_at", null)
    .limit(50);
  if (hostSchoolId) query = query.eq("school_id", hostSchoolId);
  const { data: students, error } = await query;
  if (error || !students?.length) return null;
  const rows = students as { school_id: string; person_id: string }[];

  const { data: settings } = await db
    .from("school_settings")
    .select("school_id, value")
    .eq("domain", STUDENT_ACCESS_DOMAIN)
    .in("school_id", [...new Set(rows.map((r) => r.school_id))]);
  const enabled = new Set(
    ((settings ?? []) as { school_id: string; value: unknown }[])
      .filter((s) => parseSettingsDomain("student_access", s.value).student_number_login)
      .map((s) => s.school_id),
  );
  const allowed = rows.filter((r) => enabled.has(r.school_id));
  if (!allowed.length) return null;

  const { data: people } = await db
    .from("people")
    .select("id, school_id, user_id")
    .in(
      "id",
      allowed.map((r) => r.person_id),
    )
    .is("deleted_at", null)
    .not("user_id", "is", null);
  const accounts = new Map<string, string>(); // user_id → school_id
  for (const p of (people ?? []) as { id: string; school_id: string; user_id: string }[]) {
    if (allowed.some((r) => r.person_id === p.id && r.school_id === p.school_id))
      accounts.set(p.user_id, p.school_id);
  }
  if (!accounts.size) return null;
  if (accounts.size > 1) return { error: "school_required" };

  const [userId] = accounts.keys();
  const { data: user } = await db.auth.admin.getUserById(userId!);
  const email = user?.user?.email?.trim().toLowerCase();
  return email ? { email } : null;
}

/** O que o login usa: a escola do endereço e a ficha, com o cliente do servidor. */
export async function studentNumberLoginForHost(
  studentNumber: string,
  hostname: string | null,
): Promise<StudentNumberLogin> {
  const db = (await loadSgaAdminClient()) as unknown as Db;
  return resolveStudentNumberLogin(db, studentNumber, await schoolIdForHost(db, hostname));
}
