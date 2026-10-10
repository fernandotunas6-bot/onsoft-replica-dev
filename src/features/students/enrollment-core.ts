/**
 * Núcleo da matrícula (auditoria 14).
 *
 * As mesmas regras estavam escritas, com diferenças, em `createStudent`,
 * `enrollNewStudent`, `enrollStudentInClass`, `updateEnrollment`,
 * `batchAssignClass`, `decideEnrollmentApplication` e nos importadores de alunos
 * e de matrículas: a chamada a `register_student` e a `enroll_student`, a
 * tradução da recusa por falta de 2FA (cinco cópias, com expressões diferentes),
 * «colocar ou mudar de turma» (três caminhos) e o estado do aluno depois disso.
 * Ficam aqui, uma vez.
 *
 * As regras de fundo continuam na base: `private.enroll_student` tranca a turma,
 * confirma a lotação, o ano activo e a data, e gera o número; o gatilho
 * `protect_enrollment_identity` faz o mesmo na mudança de turma. O que se
 * verifica aqui antes é para falhar cedo — antes de criar uma pessoa ou um aluno
 * que depois ficaria a meio — e com uma mensagem que diga o que corrigir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sgaClient } from "@/integrations/supabase/sga";
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { isRpcAuthDenied, publicDatabaseError } from "@/integrations/supabase/server-error";
import { schoolTodayIso } from "@/lib/school-date";
import { mapSgaGuardianRelationship } from "./schemas";
import { CURRENT_ENROLLMENT_STATUSES } from "./enrollment-sync";
import { recordStudentStatusHistoryBatch } from "./status-history";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type DbError = { code?: string | undefined; message?: string | undefined };

export const ENROLLMENT_2FA_MESSAGE =
  "Esta conta precisa de verificação em duas etapas (2FA) activa para matricular alunos.";

/** `register_student` e `enroll_student` recusam sem 2FA (`private.is_aal2`) ou sem permissão. */
export { isRpcAuthDenied };

export type RpcFailure = {
  ok: false;
  error: DbError;
  authDenied: boolean;
  /** Recusa decidida aqui, antes da base, já escrita para o utilizador. */
  userMessage?: string;
};

export type RpcOutcome<T> = { ok: true; value: T } | RpcFailure;

/** O erro a mostrar quando uma das funções da matrícula recusa. */
export function rpcFailureError(
  outcome: Omit<RpcFailure, "ok">,
  messages: { auth?: string; fallback: string },
): Error {
  if (outcome.userMessage) return new Error(outcome.userMessage);
  if (outcome.authDenied) return new Error(messages.auth ?? ENROLLMENT_2FA_MESSAGE);
  return publicDatabaseError(outcome.error, messages.fallback);
}

export type GuardianLink = {
  personId: string;
  /** Parentesco do ecrã («mae», «encarregado»…) ou já da base («mother»…). */
  relationship: string;
  isPrimary: boolean;
  /** Por omissão, o principal é o responsável financeiro. */
  financial?: boolean;
  pickup?: boolean;
};

export type RegisteredStudent = { studentId: string; studentNumber: string; status: string };

/** Cria o aluno (e o primeiro encarregado) por `register_student`: número de processo da sequência, 2FA. */
export async function registerStudentRpc(
  session: SupabaseClient,
  input: {
    schoolId: string;
    personId: string;
    admissionDate?: string | null;
    guardian?: GuardianLink | null;
  },
): Promise<RpcOutcome<RegisteredStudent>> {
  const guardian = input.guardian ?? null;
  const { data, error } = await sgaClient(session).rpc("register_student", {
    school_id: input.schoolId,
    person_id: input.personId,
    admission_date: input.admissionDate || schoolTodayIso(),
    // `undefined` e não `null`: `guardian_person_id` e `relationship` têm
    // `DEFAULT NULL` na base, e os tipos gerados declaram-nos opcionais.
    guardian_person_id: guardian?.personId ?? undefined,
    relationship: guardian ? mapSgaGuardianRelationship(guardian.relationship) : undefined,
    primary_guardian: guardian?.isPrimary ?? false,
    financial_responsibility: guardian ? (guardian.financial ?? guardian.isPrimary) : false,
    pickup_authorization: guardian?.pickup ?? true,
  });
  if (error) return { ok: false, error, authDenied: isRpcAuthDenied(error) };
  return { ok: true, value: data as unknown as RegisteredStudent };
}

export type EnrolledStudent = {
  enrollmentId: string;
  enrollmentNumber: string;
  classGroupId: string;
  status: string;
};

/** Matrícula nova por `enroll_student`: tranca a turma, lotação, ano activo, data, número, 2FA. */
export async function enrollStudentRpc(
  session: SupabaseClient,
  input: { schoolId: string; studentId: string; classGroupId: string; enrolledOn?: string | null },
): Promise<RpcOutcome<EnrolledStudent>> {
  const { data, error } = await sgaClient(session).rpc("enroll_student", {
    school_id: input.schoolId,
    student_id: input.studentId,
    class_group_id: input.classGroupId,
    enrolled_on: input.enrolledOn || schoolTodayIso(),
  });
  if (error) return { ok: false, error, authDenied: isRpcAuthDenied(error) };
  return { ok: true, value: data as unknown as EnrolledStudent };
}

export type EnrollableClass = {
  id: string;
  name: string;
  academicYearId: string;
  capacity: number | null;
};

/**
 * As regras de `enroll_student`, antes de criar a pessoa e o aluno: turma activa
 * da escola, ano lectivo activo, data dentro do ano e lugar livre. Sem isto, uma
 * turma cheia ou um ano por abrir só se descobria depois de o aluno existir, e a
 * matrícula ficava a meio («Aluno criado, mas falhou a matrícula na turma»).
 */
export async function assertClassAcceptsEnrollment(
  db: AdminDb,
  input: {
    schoolId: string;
    classGroupId: string;
    enrolledOn?: string | null;
    academicYearId?: string | null;
  },
): Promise<EnrollableClass> {
  const { data: group, error } = await db
    .from("class_groups")
    .select("id, name, academic_year_id, status, capacity")
    .eq("id", input.classGroupId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a turma.");
  if (!group) throw new Error("Turma não encontrada nesta escola.");
  if (group.status !== "active") throw new Error(`A turma ${group.name} não está activa.`);
  const academicYearId = group.academic_year_id ? String(group.academic_year_id) : null;
  if (!academicYearId) throw new Error("Esta turma não tem ano lectivo associado.");
  if (input.academicYearId && input.academicYearId !== academicYearId) {
    throw new Error("A turma não pertence ao ano lectivo indicado.");
  }

  const { data: year, error: yearError } = await db
    .from("academic_years")
    .select("name, status, starts_on, ends_on")
    .eq("id", academicYearId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (yearError) throw publicDatabaseError(yearError, "Não foi possível validar o ano lectivo.");
  if (!year || year.status !== "active") {
    throw new Error(
      `O ano lectivo ${year?.name ?? "da turma"} não está activo: só se matricula no ano activo.`,
    );
  }
  const enrolledOn = input.enrolledOn || schoolTodayIso();
  if (enrolledOn < String(year.starts_on) || enrolledOn > String(year.ends_on)) {
    throw new Error(
      `A data da matrícula (${enrolledOn}) está fora do ano lectivo ${year.name} (${year.starts_on} a ${year.ends_on}).`,
    );
  }

  const capacity = typeof group.capacity === "number" ? group.capacity : null;
  if (capacity && capacity > 0) {
    const { count, error: countError } = await db
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("school_id", input.schoolId)
      .eq("class_group_id", input.classGroupId)
      .in("status", [...CURRENT_ENROLLMENT_STATUSES]);
    if (countError) throw publicDatabaseError(countError, "Não foi possível ler a lotação.");
    if ((count ?? 0) >= capacity) throw new Error("A turma atingiu a capacidade configurada.");
  }
  return { id: String(group.id), name: String(group.name), academicYearId, capacity };
}

/** Quem saiu da escola: voltar a ser colocado numa turma reactiva-o. */
export const RETURNING_STUDENT_STATUSES = [
  "inactive",
  "cancelled",
  "transferred",
  "graduated",
  "withdrawn",
] as const;

/** Suspenso e trancado são decisões da escola: a turma não as levanta. */
const HELD_STUDENT_STATUSES = ["suspended", "locked"] as const;

const HELD_LABEL: Record<string, string> = { suspended: "suspenso", locked: "trancado" };

function isReturning(status: string | null | undefined) {
  return (RETURNING_STUDENT_STATUSES as readonly string[]).includes(status ?? "");
}

function isHeld(status: string | null | undefined) {
  return (HELD_STUDENT_STATUSES as readonly string[]).includes(status ?? "");
}

/** Estado do aluno depois de ficar com matrícula corrente numa turma. */
export function studentStatusAfterPlacement(previous: string | null | undefined): string {
  return previous && isHeld(previous) ? previous : "active";
}

/** Recusa de matrícula nova para um aluno suspenso ou trancado (null se pode). */
export function heldStudentMessage(status: string | null | undefined): string | null {
  if (!isHeld(status)) return null;
  return `O aluno está ${HELD_LABEL[status ?? ""] ?? status}: altere o estado antes de o matricular.`;
}

/**
 * Depois de colocar alunos em turma: quem não estava activo passa a activo, com
 * histórico. Antes, mover um aluno suspenso de turma levantava a suspensão sem
 * ninguém o pedir; agora suspenso e trancado ficam como estão.
 */
export async function syncStudentStatusAfterPlacement(
  db: AdminDb,
  input: {
    schoolId: string;
    students: Array<{ studentId: string; previousStatus: string | null }>;
    reason: string;
    userId: string;
  },
): Promise<number> {
  const changes = input.students.filter(
    (student) => studentStatusAfterPlacement(student.previousStatus) !== student.previousStatus,
  );
  if (!changes.length) return 0;
  const { error: activateError } = await db
    .from("students")
    .update({ status: "active", updated_by: input.userId })
    .eq("school_id", input.schoolId)
    .in(
      "id",
      changes.map((change) => change.studentId),
    );
  if (activateError) {
    throw publicDatabaseError(activateError, "Matrícula feita, mas o aluno não ficou activo.");
  }
  await recordStudentStatusHistoryBatch(db, {
    schoolId: input.schoolId,
    changes,
    newStatus: "active",
    reason: input.reason,
    changedBy: input.userId,
  });
  return changes.length;
}

/**
 * `enroll_student` só matricula candidatos e activos. Quem saiu (anulado,
 * desistente, transferido…) volta a candidato antes da chamada; se a matrícula
 * falhar, `restoreStudentStatuses` repõe o estado. Sem isto, voltar a matricular
 * um aluno depois de anular a matrícula dava sempre «Estudante, ano letivo ou
 * data de matrícula inválida».
 */
export async function reopenReturningStudents(
  db: AdminDb,
  input: { schoolId: string; studentIds: string[]; userId: string },
): Promise<void> {
  if (!input.studentIds.length) return;
  const { error } = await db
    .from("students")
    .update({ status: "applicant", updated_by: input.userId })
    .eq("school_id", input.schoolId)
    .in("id", input.studentIds)
    .in("status", [...RETURNING_STUDENT_STATUSES]);
  if (error) throw publicDatabaseError(error, "Não foi possível reabrir o processo do aluno.");
}

export async function restoreStudentStatuses(
  db: AdminDb,
  input: {
    schoolId: string;
    students: Array<{ studentId: string; status: string }>;
    userId: string;
  },
): Promise<void> {
  for (const student of input.students) {
    const { error } = await db
      .from("students")
      .update({ status: student.status, updated_by: input.userId })
      .eq("school_id", input.schoolId)
      .eq("id", student.studentId)
      .eq("status", "applicant");
    // Já se está a recusar a matrícula: fica registado no servidor, sem tapar a razão.
    if (error) console.error("[matricula] estado do aluno por repor", student.studentId, error);
  }
}

/**
 * Matrícula nova, seja qual for o estado do aluno: suspenso e trancado são
 * recusados com a razão; quem saiu é reaberto e, se a matrícula falhar, reposto.
 * Usado pela colocação em turma e pelo importador de matrículas.
 */
export async function enrollStudentReopening(
  db: AdminDb,
  session: SupabaseClient,
  input: {
    schoolId: string;
    studentId: string;
    previousStatus: string | null;
    classGroupId: string;
    enrolledOn?: string | null;
    userId: string;
  },
): Promise<RpcOutcome<EnrolledStudent>> {
  const held = heldStudentMessage(input.previousStatus);
  if (held) return { ok: false, error: { message: held }, authDenied: false, userMessage: held };
  const returning = isReturning(input.previousStatus);
  if (returning) {
    await reopenReturningStudents(db, {
      schoolId: input.schoolId,
      studentIds: [input.studentId],
      userId: input.userId,
    });
  }
  const enrolled = await enrollStudentRpc(session, input);
  if (!enrolled.ok && returning && input.previousStatus) {
    await restoreStudentStatuses(db, {
      schoolId: input.schoolId,
      students: [{ studentId: input.studentId, status: input.previousStatus }],
      userId: input.userId,
    });
  }
  return enrolled;
}

export type PlacementResult = {
  enrollmentId: string;
  enrollmentNumber: string | null;
  classGroupId: string;
  academicYearId: string;
  status: "active";
  /** true: mudou de turma na matrícula do ano; false: matrícula nova. */
  moved: boolean;
};

/**
 * Colocar um aluno numa turma — a única regra para «Turma», «Mudar», «Alterar
 * turma» na ficha e a colocação de um candidato aceite.
 *
 * - O ano lectivo é o da turma (o do browser só se confirma).
 * - Com matrícula corrente nesse ano, muda a turma na mesma matrícula: notas,
 *   presenças e contrato ficam com ela (a lotação confirma-a o gatilho).
 * - Sem matrícula corrente, matricula por `enroll_student`; quem tinha saído é
 *   reaberto; suspenso e trancado são recusados com a razão.
 * - No fim, o aluno fica activo (salvo suspenso/trancado), com histórico.
 */
export async function placeStudentInClass(
  db: AdminDb,
  session: SupabaseClient,
  input: {
    schoolId: string;
    studentId: string;
    classGroupId: string;
    academicYearId?: string | null;
    enrolledOn?: string | null;
    userId: string;
    /** Sessão com 2FA (aal2): a matrícula nova exige-o na base. */
    hasAal2: boolean;
  },
): Promise<PlacementResult> {
  const { data: group, error: groupError } = await db
    .from("class_groups")
    .select("id, academic_year_id")
    .eq("id", input.classGroupId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (groupError) throw publicDatabaseError(groupError, "Não foi possível validar a turma.");
  if (!group) throw new Error("Turma não encontrada nesta escola.");
  const academicYearId = group.academic_year_id ? String(group.academic_year_id) : null;
  if (!academicYearId) throw new Error("Esta turma não tem ano lectivo associado.");
  if (input.academicYearId && input.academicYearId !== academicYearId) {
    throw new Error("A turma não pertence ao ano lectivo indicado.");
  }

  const { data: student, error: studentError } = await db
    .from("students")
    .select("id, status")
    .eq("id", input.studentId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (studentError) throw publicDatabaseError(studentError, "Não foi possível ler o aluno.");
  if (!student) throw new Error("Aluno não encontrado nesta escola.");
  const previousStatus = (student.status as string | null) ?? null;

  // Só a matrícula corrente do ano (a base admite uma pendente ou activa). Uma
  // anulada fica no histórico; nunca é reactivada.
  const { data: current, error: currentError } = await db
    .from("enrollments")
    .select("id, enrollment_number")
    .eq("student_id", input.studentId)
    .eq("academic_year_id", academicYearId)
    .eq("school_id", input.schoolId)
    .in("status", [...CURRENT_ENROLLMENT_STATUSES])
    .maybeSingle();
  if (currentError) {
    throw publicDatabaseError(currentError, "Não foi possível verificar matrículas existentes.");
  }

  let result: PlacementResult;
  if (current) {
    const { error } = await db
      .from("enrollments")
      .update({ class_group_id: input.classGroupId, status: "active", updated_by: input.userId })
      .eq("id", current.id)
      .eq("school_id", input.schoolId);
    if (error) throw publicDatabaseError(error, "Não foi possível mudar o aluno de turma.");
    result = {
      enrollmentId: String(current.id),
      enrollmentNumber: (current.enrollment_number as string | null) ?? null,
      classGroupId: input.classGroupId,
      academicYearId,
      status: "active",
      moved: true,
    };
  } else {
    const held = heldStudentMessage(previousStatus);
    if (held) throw new Error(held);
    if (!input.hasAal2) throw new Error(ENROLLMENT_2FA_MESSAGE);
    const enrolled = await enrollStudentReopening(db, session, {
      schoolId: input.schoolId,
      studentId: input.studentId,
      previousStatus,
      classGroupId: input.classGroupId,
      enrolledOn: input.enrolledOn ?? null,
      userId: input.userId,
    });
    if (!enrolled.ok) {
      throw rpcFailureError(enrolled, {
        fallback: "Não foi possível matricular o aluno na turma.",
      });
    }
    result = {
      enrollmentId: enrolled.value.enrollmentId,
      enrollmentNumber: enrolled.value.enrollmentNumber,
      classGroupId: input.classGroupId,
      academicYearId,
      status: "active",
      moved: false,
    };
  }

  await syncStudentStatusAfterPlacement(db, {
    schoolId: input.schoolId,
    students: [{ studentId: input.studentId, previousStatus }],
    reason: result.moved ? "Colocado em turma" : "Matrícula em turma",
    userId: input.userId,
  });
  return result;
}
