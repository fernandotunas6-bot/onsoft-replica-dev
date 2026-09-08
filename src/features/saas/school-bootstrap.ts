import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FEE_ITEMS, DEFAULT_FEE_PLAN_NAME } from "@/features/finance/fee-plan-defaults";
import {
  bootstrapAcademicStructure,
  bootstrapAcademicYearIfMissing,
} from "@/features/academic/academic-bootstrap";
import { schoolSettingDefaults } from "@/lib/school-config";

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /schema cache|does not exist|relation .* does not exist/i.test(error.message ?? "")),
  );
}

/**
 * Dados mínimos para uma escola recém-provisionada operar: formulário público,
 * definições e papéis RBAC — e, quando já existe ano lectivo activo, o plano
 * financeiro com propina/matrícula.
 *
 * O ano lectivo **não** é inventado aqui: `bootstrapAcademicYearIfMissing` só
 * cria um quando o chamador dá nome e datas explícitas, e o provisionamento
 * não os tem. Como `fee_plans.academic_year_id` é NOT NULL, o plano financeiro
 * depende desse ano — o onboarding do dashboard pede-o como primeiro passo.
 *
 * Falhas parciais (tabela em falta no SGA) são ignoradas — o provisionamento
 * principal não deve falhar por causa disto.
 */
export async function bootstrapSchoolDefaults(
  db: SupabaseClient,
  input: {
    schoolId: string;
    schoolName: string;
    slug: string;
    adminUserId: string | null;
  },
): Promise<{ seeded: string[] }> {
  const seeded: string[] = [];

  const year = await bootstrapAcademicYearIfMissing(db, { schoolId: input.schoolId });
  seeded.push(...year.seeded);

  // fee_plans.academic_year_id é NOT NULL: sem ano lectivo activo o insert
  // falhava sempre (23502) e só deixava um aviso na consola do servidor.
  const { data: activeYear } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const { data: existingPlan } = await db
    .from("fee_plans")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (activeYear?.id && !existingPlan?.id) {
    const { data: plan, error: planErr } = await db
      .from("fee_plans")
      .insert({
        school_id: input.schoolId,
        academic_year_id: activeYear.id,
        name: DEFAULT_FEE_PLAN_NAME,
        status: "active",
      })
      .select("id")
      .single();
    if (!planErr && plan?.id) {
      seeded.push("plano financeiro");
      const { error: itemsErr } = await db.from("fee_items").insert(
        DEFAULT_FEE_ITEMS.map((item) => ({
          school_id: input.schoolId,
          fee_plan_id: plan.id,
          name: item.name,
          kind: item.kind,
          amount: item.amount,
          is_active: true,
        })),
      );
      if (!itemsErr) seeded.push("itens de propina");
    } else if (!isMissingTable(planErr)) {
      console.warn("[bootstrapSchoolDefaults] fee_plans:", planErr?.message);
    }
  }

  const { data: existingForm } = await db
    .from("enrollment_forms")
    .select("id")
    .eq("school_id", input.schoolId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!existingForm?.id) {
    const formPayload: Record<string, unknown> = {
      school_id: input.schoolId,
      slug: input.slug,
      title: "Candidatura a matrícula",
      subtitle: input.schoolName,
      hero_text: "Preencha os dados do aluno para a secretaria confirmar a matrícula.",
      accent_color: "#1d4ed8",
      is_open: true,
    };
    if (input.adminUserId) {
      formPayload.created_by = input.adminUserId;
      formPayload.updated_by = input.adminUserId;
    }
    const { error } = await db.from("enrollment_forms").insert(formPayload);
    if (!error) seeded.push("formulário de matrícula");
    else if (!isMissingTable(error)) {
      console.warn("[bootstrapSchoolDefaults] enrollment_forms:", error.message);
    }
  }

  // `school_settings` é uma tabela domínio/valor: todo o código de leitura filtra
  // por `domain` e lê o JSON de `value`. O seed anterior escrevia colunas planas
  // (`academic_year`, `currency`), que a aplicação nunca leria — e o erro era
  // engolido pelo `console.warn` abaixo, pelo que escolas novas ficavam sem
  // definições nenhumas sem que o provisionamento desse sinal.
  const { data: existingAcademic } = await db
    .from("school_settings")
    .select("school_id")
    .eq("school_id", input.schoolId)
    .eq("domain", "academic")
    .maybeSingle();
  if (!existingAcademic?.school_id) {
    const { error } = await db.from("school_settings").insert({
      school_id: input.schoolId,
      domain: "academic",
      version: 1,
      value: {
        academic_year: `Ano Lectivo ${new Date().getFullYear()}`,
        evaluation_periods: schoolSettingDefaults.evaluationPeriods,
        passing_grade: schoolSettingDefaults.passingGrade,
      },
      ...(input.adminUserId ? { changed_by: input.adminUserId } : {}),
    });
    if (!error) seeded.push("definições da escola");
    else if (!isMissingTable(error)) {
      console.warn("[bootstrapSchoolDefaults] school_settings:", error.message);
    }
  }

  // ── Papéis canónicos da escola ───────────────────────────────────────────
  // Seed apenas se a tabela existir; falha silenciosa caso contrário.
  const DEFAULT_ROLES = [
    { code: "owner", name: "Proprietário", is_system: false },
    { code: "admin", name: "Administrador", is_system: false },
    { code: "secretary", name: "Secretaria", is_system: false },
    { code: "treasury", name: "Tesouraria", is_system: false },
    { code: "teacher", name: "Professor", is_system: false },
    { code: "student", name: "Aluno", is_system: false },
    { code: "guardian", name: "Encarregado", is_system: false },
    { code: "user", name: "Utilizador", is_system: false },
  ] as const;

  try {
    const { data: existingRoles } = await db
      .from("roles")
      .select("code")
      .eq("school_id", input.schoolId);
    const existingCodes = new Set((existingRoles ?? []).map((r: { code: string }) => r.code));
    const toInsert = DEFAULT_ROLES.filter((r) => !existingCodes.has(r.code)).map((r) => ({
      ...r,
      school_id: input.schoolId,
    }));
    if (toInsert.length > 0) {
      const { error: rolesErr } = await db.from("roles").insert(toInsert);
      if (!rolesErr) seeded.push("papéis RBAC");
      else if (!isMissingTable(rolesErr)) {
        console.warn("[bootstrapSchoolDefaults] roles:", rolesErr.message);
      }
    }
  } catch {
    // Tabela roles ainda não existe — ignorar
  }

  const academic = await bootstrapAcademicStructure(db, {
    schoolId: input.schoolId,
    userId: input.adminUserId,
  });
  seeded.push(...academic.seeded);

  return { seeded };
}
