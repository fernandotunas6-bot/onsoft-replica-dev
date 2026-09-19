import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_FEE_ITEMS,
  DEFAULT_FEE_PLAN_CODE,
  DEFAULT_FEE_PLAN_NAME,
} from "@/features/finance/fee-plan-defaults";
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

// Conjunto validado em produção (escola "Colegio Adventista - Huambo", semeada
// manualmente antes deste bootstrap existir). `private.has_permission()` faz
// JOIN a `role_permissions`: sem estas linhas, TODAS as RPCs finas (registar
// aluno, lançar pagamento, emitir documento…) rejeitam qualquer utilizador da
// escola, incluindo o dono — bloqueador descoberto no Ciclo 60. owner/admin
// recebem sempre a totalidade das permissões (acesso total do dono/admin);
// as restantes correspondem ao que a Secretaria já usa em produção. Papéis
// treasury/teacher/student/guardian/user ainda não têm um conjunto de
// referência — ficam sem permissões finas nesta fatia.
export const SECRETARY_PERMISSION_CODES = [
  "academic.classes.read",
  "academic.classes.manage",
  "academic.structure.read",
  "academic.subjects.read",
  "academic.subjects.manage",
  "academic.timetable.read",
  "academic.timetable.manage",
  "attendance.records.read",
  "assessment.grades.read",
  "assessment.reports.read",
  "communication.announcements.read",
  "communication.announcements.manage",
  "communication.inbox.read",
  "communication.preferences.manage",
  "documents.archive.manage",
  "documents.archive.read",
  "documents.batch.issue",
  "documents.cases.manage",
  "documents.cases.read",
  "documents.issued.issue",
  "documents.issued.read",
  "documents.issued.revoke",
  "documents.requests.manage",
  "documents.requests.read",
  "documents.signatures.read",
  "documents.signatures.sign",
  "documents.templates.manage",
  "documents.templates.read",
  "people.records.read",
  "people.records.create",
  "people.records.update",
  "portal.access.manage",
  "portal.access.read",
  "students.records.read",
  "students.records.create",
  "students.records.update",
  "students.enrollments.read",
  "students.enrollments.create",
  "students.enrollments.update",
  "teachers.records.read",
  "teachers.records.create",
  "teachers.records.update",
] as const;

export const TREASURY_PERMISSION_CODES = [
  "finance.contracts.create",
  "finance.contracts.read",
  "finance.invoices.cancel",
  "finance.invoices.read",
  "finance.payments.create",
  "finance.payments.reverse",
  "finance.settings.manage",
  "finance.settings.read",
  "students.records.read",
  "students.enrollments.read",
  "people.records.read",
  "documents.issued.read",
  "documents.issued.issue",
  "documents.templates.read",
  "documents.requests.read",
  "documents.requests.manage",
  "files.objects.read",
  "files.objects.create",
  "communication.inbox.read",
  "communication.announcements.read",
] as const;

export const TEACHER_PERMISSION_CODES = [
  "academic.classes.read",
  "academic.structure.read",
  "academic.subjects.read",
  "academic.timetable.read",
  "attendance.records.read",
  "attendance.records.take",
  "assessment.grades.read",
  "assessment.grades.manage",
  "assessment.grades.submit",
  "assessment.complaints.read",
  "assessment.reports.read",
  "assessment.rules.read",
  "students.records.read",
  "students.enrollments.read",
  "people.records.read",
  "communication.inbox.read",
  "communication.announcements.read",
  "files.objects.read",
  "files.objects.create",
] as const;

export const GUARDIAN_PERMISSION_CODES = [
  "academic.structure.read",
  "academic.classes.read",
  "academic.timetable.read",
  "assessment.grades.read",
  "assessment.reports.read",
  "attendance.records.read",
  "finance.contracts.read",
  "finance.invoices.read",
  "communication.announcements.read",
  "communication.inbox.read",
  "documents.issued.read",
  "documents.requests.read",
  "documents.requests.manage",
  "students.records.read",
] as const;

export const STUDENT_PERMISSION_CODES = [
  "academic.structure.read",
  "academic.classes.read",
  "academic.timetable.read",
  "assessment.grades.read",
  "assessment.reports.read",
  "attendance.records.read",
  "communication.announcements.read",
  "communication.inbox.read",
  "documents.issued.read",
  "documents.requests.read",
  "documents.requests.manage",
] as const;

export const USER_PERMISSION_CODES = [
  "communication.announcements.read",
  "communication.inbox.read",
] as const;

export const DEFAULT_ROLES = [
  { code: "owner", name: "Proprietário", is_system: false },
  { code: "admin", name: "Administrador", is_system: false },
  { code: "secretary", name: "Secretaria", is_system: false },
  { code: "treasury", name: "Tesouraria", is_system: false },
  { code: "teacher", name: "Professor", is_system: false },
  { code: "student", name: "Aluno", is_system: false },
  { code: "guardian", name: "Encarregado", is_system: false },
  { code: "user", name: "Utilizador", is_system: false },
] as const;

export async function seedDefaultRolePermissions(db: SupabaseClient, schoolId: string) {
  try {
    const [{ data: roles, error: rolesError }, { data: permissions, error: permsError }] =
      await Promise.all([
        db.from("roles").select("id, code").eq("school_id", schoolId),
        db.from("permissions").select("id, code"),
      ]);
    if (rolesError) {
      if (!isMissingTable(rolesError)) {
        console.warn("[seedDefaultRolePermissions] roles:", rolesError.message);
      }
      return;
    }
    if (permsError) {
      if (!isMissingTable(permsError)) {
        console.warn("[seedDefaultRolePermissions] permissions:", permsError.message);
      }
      return;
    }

    const permMap = new Map<string, string>();
    for (const p of permissions ?? []) {
      const pTyped = p as { id: string; code: string };
      permMap.set(pTyped.code, pTyped.id);
    }
    const allPermissionIds = Array.from(permMap.values());
    const filterIds = (codes: readonly string[]) =>
      codes.map((c) => permMap.get(c)).filter((id): id is string => Boolean(id));

    const secretaryPermissionIds = filterIds(SECRETARY_PERMISSION_CODES);
    const treasuryPermissionIds = filterIds(TREASURY_PERMISSION_CODES);
    const teacherPermissionIds = filterIds(TEACHER_PERMISSION_CODES);
    const guardianPermissionIds = filterIds(GUARDIAN_PERMISSION_CODES);
    const studentPermissionIds = filterIds(STUDENT_PERMISSION_CODES);
    const userPermissionIds = filterIds(USER_PERMISSION_CODES);

    const rows: { school_id: string; role_id: string; permission_id: string }[] = [];
    for (const role of roles ?? []) {
      const roleTyped = role as { id: string; code: string };
      let permissionIds: string[] = [];
      switch (roleTyped.code) {
        case "owner":
        case "admin":
          permissionIds = allPermissionIds;
          break;
        case "secretary":
          permissionIds = secretaryPermissionIds;
          break;
        case "treasury":
          permissionIds = treasuryPermissionIds;
          break;
        case "teacher":
          permissionIds = teacherPermissionIds;
          break;
        case "guardian":
          permissionIds = guardianPermissionIds;
          break;
        case "student":
          permissionIds = studentPermissionIds;
          break;
        case "user":
          permissionIds = userPermissionIds;
          break;
      }
      for (const permissionId of permissionIds) {
        rows.push({ school_id: schoolId, role_id: roleTyped.id, permission_id: permissionId });
      }
    }
    if (rows.length === 0) return;

    const { error: insertError } = await db
      .from("role_permissions")
      .upsert(rows, { onConflict: "school_id,role_id,permission_id", ignoreDuplicates: true });
    if (insertError && !isMissingTable(insertError)) {
      console.warn("[seedDefaultRolePermissions] role_permissions:", insertError.message);
    }
  } catch (error) {
    console.warn(
      "[seedDefaultRolePermissions] falhou:",
      error instanceof Error ? error.message : error,
    );
  }
}

// `private.next_document_number()` (usada por register_payment e outras RPCs
// RBAC-v2 para gerar nº de fatura/recibo) exige uma linha em
// `document_sequences` por (escola, tipo) — sem isto falha com 55000
// "Sequência de documentos não configurada para esta escola". Mesma classe de
export const DEFAULT_DOCUMENT_SEQUENCES = [
  { document_type: "invoice", prefix: "FT", next_number: 1, padding: 4 },
  { document_type: "receipt", prefix: "RC", next_number: 1, padding: 6 },
  {
    document_type: "credit_note",
    prefix: "NC",
    next_number: 1,
    padding: 6,
  },
  { document_type: "expense", prefix: "EX", next_number: 1, padding: 6 },
  {
    document_type: "declaration",
    prefix: "DC",
    next_number: 1,
    padding: 6,
  },
  {
    document_type: "certificate",
    prefix: "CE",
    next_number: 1,
    padding: 6,
  },
  { document_type: "transfer", prefix: "TF", next_number: 1, padding: 6 },
  { document_type: "term", prefix: "TM", next_number: 1, padding: 6 },
  { document_type: "other", prefix: "OT", next_number: 1, padding: 6 },
] as const;

export async function seedDefaultDocumentSequences(db: SupabaseClient, schoolId: string) {
  try {
    const rows = DEFAULT_DOCUMENT_SEQUENCES.map((seq) => ({
      school_id: schoolId,
      ...seq,
    }));
    const { error } = await db
      .from("document_sequences")
      .upsert(rows, { onConflict: "school_id,document_type", ignoreDuplicates: true });
    if (error && !isMissingTable(error)) {
      console.warn("[seedDefaultDocumentSequences] document_sequences:", error.message);
    }
  } catch (error) {
    console.warn(
      "[seedDefaultDocumentSequences] falhou:",
      error instanceof Error ? error.message : error,
    );
  }
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
    // Obrigatório: school_settings.changed_by é NOT NULL sem default. O único
    // chamador (provisioning-core.ts) só invoca esta função depois de garantir
    // um administrador criado com sucesso — tornar isto opcional permitiu, no
    // passado, um insert silencioso a falhar com 23502 sob console.warn.
    adminUserId: string;
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
        code: DEFAULT_FEE_PLAN_CODE,
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
          code: item.code,
          name: item.name,
          kind: item.kind,
          frequency: item.frequency,
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
      changed_by: input.adminUserId,
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

  await seedDefaultRolePermissions(db, input.schoolId);
  await seedDefaultDocumentSequences(db, input.schoolId);

  const academic = await bootstrapAcademicStructure(db, {
    schoolId: input.schoolId,
    userId: input.adminUserId,
  });
  seeded.push(...academic.seeded);

  return { seeded };
}
