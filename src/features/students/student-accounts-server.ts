/**
 * Contas de acesso dos alunos (Pessoas → Acessos dos alunos).
 *
 * A 26/10/2026 a escola real tinha 72 alunos activos e nenhum com conta: o login
 * por número ou BI não tinha a quem encaminhar. Aqui a Secretaria cria as contas
 * de uma turma de uma vez; cada senha provisória aparece uma única vez (para a
 * ficha impressa), nunca se guarda, e tem de ser trocada no primeiro acesso.
 *
 * Criar contas e definir senhas de menores pede 2FA nesta sessão, como a
 * redefinição de senha de funcionários.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { requireAal2 } from "@/features/hr/require-aal2";
import { recordAccessAudit, recordAuditBatch } from "@/features/audit/record-audit";
import { readSettingsDomain } from "@/features/school/settings-domains";
import { ACCOUNTS_BATCH, provisionalPassword, studentLoginEmail } from "./student-accounts";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

const MANAGE_ROLES: Array<"Administrador" | "Secretaria"> = ["Administrador", "Secretaria"];
const LOGIN_STATUSES = ["active", "applicant"];

export type StudentAccountLine = {
  studentId: string;
  name: string;
  studentNumber: string;
  classGroupId: string;
  classLabel: string;
  hasAccount: boolean;
  hasBi: boolean;
};

/** Alunos do ano lectivo activo, por turma, com o estado da conta. */
export const listStudentAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const [{ data: year }, { data: school }, settings] = await Promise.all([
      db
        .from("academic_years")
        .select("id, name")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("schools").select("public_code").eq("id", schoolId).maybeSingle(),
      readSettingsDomain(db, schoolId, "student_access"),
    ]);
    const base = {
      yearName: year?.name ? str(year.name) : null,
      schoolCode: str(school?.public_code),
      numberLoginEnabled: Boolean(settings.student_number_login),
      isAdministrator: (membership.allAppRoles ?? [membership.appRole]).includes("Administrador"),
      students: [] as StudentAccountLine[],
    };
    if (!year) return base;

    const { data: groups, error: groupError } = await db
      .from("class_groups")
      .select("id, code, name")
      .eq("school_id", schoolId)
      .eq("academic_year_id", str(year.id));
    if (groupError) throw publicDatabaseError(groupError, "Não foi possível ler as turmas.");
    const groupOf = new Map(((groups ?? []) as Row[]).map((row) => [str(row.id), row]));
    const { data: enrollments, error } = groupOf.size
      ? await db
          .from("enrollments")
          .select("student_id, class_group_id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", str(year.id))
          .in("status", ["pending", "active"])
      : { data: [] as Row[], error: null };
    if (error) throw publicDatabaseError(error, "Não foi possível ler as matrículas.");
    const classOf = new Map(
      ((enrollments ?? []) as Row[]).map((row) => [str(row.student_id), str(row.class_group_id)]),
    );
    const studentIds = [...classOf.keys()];
    const lines = await loadStudentLines(db, schoolId, studentIds);
    base.students = lines
      .map((line) => {
        const group = groupOf.get(classOf.get(line.studentId) ?? "");
        return {
          ...line,
          classGroupId: str(group?.id),
          classLabel: group ? `${str(group.name)} (${str(group.code)})` : "—",
        };
      })
      .sort(
        (a, b) =>
          a.classLabel.localeCompare(b.classLabel, "pt", { numeric: true }) ||
          a.name.localeCompare(b.name, "pt"),
      );
    return base;
  });

async function loadStudentLines(
  db: Db,
  schoolId: string,
  studentIds: string[],
): Promise<
  Array<
    Omit<StudentAccountLine, "classGroupId" | "classLabel"> & { personId: string; status: string }
  >
> {
  if (!studentIds.length) return [];
  const { data: students, error } = await db
    .from("students")
    .select("id, person_id, student_number, status")
    .eq("school_id", schoolId)
    .in("id", studentIds)
    .is("deleted_at", null);
  if (error) throw publicDatabaseError(error, "Não foi possível ler os alunos.");
  const personIds = ((students ?? []) as Row[]).map((row) => str(row.person_id));
  const { data: people, error: peopleError } = personIds.length
    ? await db
        .from("people")
        .select("id, full_name, national_id, user_id")
        .eq("school_id", schoolId)
        .in("id", personIds)
    : { data: [] as Row[], error: null };
  if (peopleError) throw publicDatabaseError(peopleError, "Não foi possível ler as fichas.");
  const personOf = new Map(((people ?? []) as Row[]).map((row) => [str(row.id), row]));
  return ((students ?? []) as Row[]).map((row) => {
    const person = personOf.get(str(row.person_id));
    return {
      studentId: str(row.id),
      personId: str(row.person_id),
      status: str(row.status),
      name: str(person?.full_name) || "—",
      studentNumber: str(row.student_number),
      hasAccount: Boolean(person?.user_id),
      hasBi: Boolean(person?.national_id),
    };
  });
}

export type IssuedCredential = {
  studentId: string;
  name: string;
  studentNumber: string;
  password: string;
};

/** Cria as contas em falta. As senhas voltam uma vez, para imprimir; não se guardam. */
export const createStudentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ studentIds: z.array(z.string().guid()).min(1).max(ACCOUNTS_BATCH) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    requireAal2(context.claims ?? {}, "Criar contas de acesso de alunos");
    const membership = await requireSgaWriterForWrite(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const [{ data: school }, { data: role }] = await Promise.all([
      db.from("schools").select("public_code").eq("id", schoolId).maybeSingle(),
      db
        .from("roles")
        .select("id")
        .eq("school_id", schoolId)
        .in("code", ["student", "aluno"])
        .limit(1)
        .maybeSingle(),
    ]);
    if (!school?.public_code) throw new Error("A escola não tem código público.");
    if (!role?.id) throw new Error("A escola não tem o papel «Estudante».");

    const issued: IssuedCredential[] = [];
    const failed: Array<{ studentId: string; name: string; message: string }> = [];
    const lines = await loadStudentLines(db, schoolId, data.studentIds);
    for (const line of lines) {
      if (line.hasAccount) continue;
      try {
        if (!LOGIN_STATUSES.includes(line.status)) {
          throw new Error("O aluno não está activo nesta escola.");
        }
        if (!line.studentNumber) throw new Error("O aluno não tem número de aluno.");
        const password = provisionalPassword();
        await createOne(db, {
          schoolId,
          roleId: str(role.id),
          personId: line.personId,
          fullName: line.name,
          email: studentLoginEmail(line.studentNumber, str(school.public_code)),
          password,
        });
        issued.push({
          studentId: line.studentId,
          name: line.name,
          studentNumber: line.studentNumber,
          password,
        });
      } catch (error) {
        failed.push({
          studentId: line.studentId,
          name: line.name,
          message: error instanceof Error ? error.message : "Não foi possível criar a conta.",
        });
      }
    }
    await recordAuditBatch(
      issued.map((credential) => ({
        schoolId,
        actorUserId: context.userId,
        action: "access.student_account_created",
        entityType: "student",
        entityId: credential.studentId,
        metadata: { student_number: credential.studentNumber },
      })),
    );
    return { issued, failed };
  });

/** Conta, perfil, membership de aluno e ligação à ficha — ou nada (sem contas órfãs). */
async function createOne(
  db: Db,
  input: {
    schoolId: string;
    roleId: string;
    personId: string;
    fullName: string;
    email: string;
    password: string;
  },
) {
  const { data: created, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    // app_metadata: só o servidor escreve — o aluno não desliga a troca obrigatória.
    app_metadata: { must_change_password: true, account_kind: "student" },
    user_metadata: { full_name: input.fullName },
  });
  if (error || !created.user?.id) {
    throw new Error(
      /already|registered|exists/i.test(error?.message ?? "")
        ? "Já existe uma conta com este número de aluno. Use «Nova senha»."
        : "Não foi possível criar a conta.",
    );
  }
  const userId = created.user.id;
  try {
    const { error: profileError } = await db
      .from("profiles")
      .upsert(
        { id: userId, display_name: input.fullName, full_name: input.fullName, cargo: "Aluno" },
        { onConflict: "id" },
      );
    if (profileError) throw publicDatabaseError(profileError, "Não foi possível criar o perfil.");
    const { data: membership, error: membershipError } = await db
      .from("school_memberships")
      .insert({ school_id: input.schoolId, user_id: userId, status: "active" })
      .select("id")
      .single();
    if (membershipError || !membership) {
      throw publicDatabaseError(membershipError!, "Não foi possível criar a membership.");
    }
    const { error: roleError } = await db.from("member_roles").insert({
      school_id: input.schoolId,
      membership_id: membership.id,
      role_id: input.roleId,
    });
    if (roleError) throw publicDatabaseError(roleError, "Não foi possível atribuir o papel.");
    // Só uma ficha ainda sem conta: duas Secretarias ao mesmo tempo não criam duas.
    const { data: linked, error: linkError } = await db
      .from("people")
      .update({ user_id: userId })
      .eq("id", input.personId)
      .eq("school_id", input.schoolId)
      .is("user_id", null)
      .select("id");
    if (linkError) throw publicDatabaseError(linkError, "Não foi possível ligar a ficha.");
    if (!linked?.length) throw new Error("A ficha já tem conta (criada noutro ecrã).");
  } catch (provisioningError) {
    try {
      await db.auth.admin.deleteUser(userId);
    } catch (cleanupError) {
      console.error(`[createStudentAccounts] conta órfã ${userId}:`, cleanupError);
    }
    throw provisioningError;
  }
}

/** Nova senha provisória para um aluno que a esqueceu (troca obrigatória outra vez). */
export const resetStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ studentId: z.string().guid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims ?? {}, "Redefinir a senha de um aluno");
    const membership = await requireSgaWriterForWrite(
      "pessoas",
      context.supabase,
      context.userId,
      MANAGE_ROLES,
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const [line] = await loadStudentLines(db, schoolId, [data.studentId]);
    if (!line) throw new Error("Aluno não encontrado nesta escola.");
    const { data: person } = await db
      .from("people")
      .select("user_id")
      .eq("id", line.personId)
      .eq("school_id", schoolId)
      .maybeSingle();
    const userId = person?.user_id ? str(person.user_id) : null;
    if (!userId) throw new Error("Este aluno ainda não tem conta. Crie-a primeiro.");
    await assertStudentOnlyAccount(db, schoolId, userId);

    const { data: current } = await db.auth.admin.getUserById(userId);
    const password = provisionalPassword();
    const { error } = await db.auth.admin.updateUserById(userId, {
      password,
      app_metadata: { ...(current.user?.app_metadata ?? {}), must_change_password: true },
    });
    if (error) throw new Error("Não foi possível redefinir a senha.");
    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.student_password_reset",
      entityType: "student",
      entityId: data.studentId,
    });
    return {
      studentId: line.studentId,
      name: line.name,
      studentNumber: line.studentNumber,
      password,
    } satisfies IssuedCredential;
  });

/**
 * A senha vale para todas as escolas e papéis da conta. A Secretaria só a muda
 * se a conta for de aluno, só nesta escola — nunca a de um funcionário ou de um
 * encarregado que também seja aluno noutro lado.
 */
async function assertStudentOnlyAccount(db: Db, schoolId: string, userId: string) {
  const { data: memberships, error } = await db
    .from("school_memberships")
    .select("id, school_id")
    .eq("user_id", userId);
  if (error) throw publicDatabaseError(error, "Não foi possível confirmar a conta.");
  const rows = (memberships ?? []) as Row[];
  if (!rows.length || rows.some((row) => str(row.school_id) !== schoolId)) {
    throw new Error("Esta conta também dá acesso a outra escola: use a recuperação de senha.");
  }
  const { data: roles, error: roleError } = await db
    .from("member_roles")
    .select("roles(code)")
    .in(
      "membership_id",
      rows.map((row) => str(row.id)),
    );
  if (roleError) throw publicDatabaseError(roleError, "Não foi possível confirmar o papel.");
  const codes = ((roles ?? []) as Array<{ roles: { code?: string } | null }>).map((row) =>
    str(row.roles?.code),
  );
  if (!codes.length || codes.some((code) => !["student", "aluno"].includes(code))) {
    throw new Error("Esta conta não é só de aluno: a senha muda-se em Acessos.");
  }
}
