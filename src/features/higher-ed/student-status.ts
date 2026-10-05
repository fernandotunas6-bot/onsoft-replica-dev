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
import { NO_STATUS, type StudentStatus } from "./engine";

/**
 * Estatuto de trabalhador-estudante (`student_special_statuses`, 20261004140000).
 *
 * Tabela sensível (dados de emprego): só este servidor lhe toca, com
 * Administrador/Secretaria. As regras que o estatuto muda (faltas, época especial,
 * situação académica) estão no motor (`engine.ts`) e ligam-se no regulamento.
 *
 * Sem a tabela na base (migração por aplicar), ninguém tem estatuto: as regras
 * normais aplicam-se e conceder o estatuto diz o que falta.
 */

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
const OFFICE = ["Administrador", "Secretaria"] as const;

const missingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /student_special_statuses/.test(error.message ?? "")),
  );

const todayIso = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);

/** Estatuto em vigor numa data: não revogado, já começou e ainda não acabou. */
export function statusInForce(
  row: { valid_from: string; valid_until: string | null; revoked_at: string | null },
  on: string,
) {
  return !row.revoked_at && row.valid_from <= on && (!row.valid_until || row.valid_until >= on);
}

/** Estatutos em vigor hoje de vários estudantes (para pautas). */
export async function studentStatusMap(
  db: Db,
  schoolId: string,
  studentIds: string[],
): Promise<Map<string, StudentStatus>> {
  const map = new Map<string, StudentStatus>();
  if (!studentIds.length) return map;
  const { data, error } = await db
    .from("student_special_statuses")
    .select("student_id, kind, valid_from, valid_until, revoked_at")
    .eq("school_id", schoolId)
    .in("student_id", studentIds)
    .is("revoked_at", null);
  if (error) {
    if (missingTable(error)) return map;
    throw publicDatabaseError(error, "Não foi possível ler os estatutos dos estudantes.");
  }
  const today = todayIso();
  for (const row of data ?? []) {
    if (row.kind === "worker_student" && statusInForce(row, today)) {
      map.set(String(row.student_id), { workerStudent: true });
    }
  }
  return map;
}

export async function studentStatusOf(
  db: Db,
  schoolId: string,
  studentId: string,
): Promise<StudentStatus> {
  return (await studentStatusMap(db, schoolId, [studentId])).get(studentId) ?? NO_STATUS;
}

const studentInput = z.object({ studentId: z.string().uuid() });

export const getStudentSpecialStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => studentInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...OFFICE,
    ]);
    const db = await loadSgaAdminClient();
    const { data: rows, error } = await db
      .from("student_special_statuses")
      .select(
        "id, kind, valid_from, valid_until, employer, evidence_note, revoked_at, revoke_reason, created_at",
      )
      .eq("school_id", membership.schoolId)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });
    if (error) {
      if (missingTable(error)) return { available: false as const, statuses: [] };
      throw publicDatabaseError(error, "Não foi possível ler o estatuto do estudante.");
    }
    const today = todayIso();
    return {
      available: true as const,
      statuses: (rows ?? []).map((row) => ({ ...row, inForce: statusInForce(row, today) })),
    };
  });

const grantInput = z
  .object({
    studentId: z.string().uuid(),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    employer: z.string().trim().max(200).optional().default(""),
    evidenceNote: z
      .string()
      .trim()
      .min(3, "Indique a prova (declaração do empregador…).")
      .max(1000),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.validFrom, {
    message: "A data de fim tem de ser depois do início.",
  });

export const grantWorkerStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => grantInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Conceder o estatuto de trabalhador-estudante");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...OFFICE],
    );
    const db = await loadSgaAdminClient();
    const { data: student } = await db
      .from("students")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.studentId)
      .maybeSingle();
    if (!student) throw new Error("Estudante não encontrado nesta escola.");
    const { data: row, error } = await db
      .from("student_special_statuses")
      .insert({
        school_id: membership.schoolId,
        student_id: data.studentId,
        kind: "worker_student",
        valid_from: data.validFrom,
        valid_until: data.validUntil ?? null,
        employer: data.employer || null,
        evidence_note: data.evidenceNote,
        granted_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (missingTable(error)) {
        throw new Error(
          "O estatuto ainda não está disponível nesta base: falta aplicar a migração 20261004140000_student_special_statuses.",
        );
      }
      if (error.code === "23505") {
        throw new Error("Este estudante já tem o estatuto em vigor. Revogue-o antes de o renovar.");
      }
      throw publicDatabaseError(error, "Não foi possível conceder o estatuto.");
    }
    await db.from("audit_logs").insert({
      school_id: membership.schoolId,
      actor_user_id: context.userId,
      action: "student.special_status.granted",
      entity_type: "student_special_status",
      entity_id: row.id,
      metadata: { student_id: data.studentId, kind: "worker_student", valid_from: data.validFrom },
    });
    return { id: String(row.id) };
  });

const revokeInput = z.object({
  statusId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const revokeStudentSpecialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => revokeInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Revogar um estatuto do estudante");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...OFFICE],
    );
    const db = await loadSgaAdminClient();
    const { data: row, error } = await db
      .from("student_special_statuses")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
        revoke_reason: data.reason,
      })
      .eq("school_id", membership.schoolId)
      .eq("id", data.statusId)
      .is("revoked_at", null)
      .select("id, student_id")
      .maybeSingle();
    if (error) {
      if (missingTable(error)) throw new Error("O estatuto ainda não está disponível nesta base.");
      throw publicDatabaseError(error, "Não foi possível revogar o estatuto.");
    }
    if (!row) throw new Error("Estatuto não encontrado ou já revogado.");
    await db.from("audit_logs").insert({
      school_id: membership.schoolId,
      actor_user_id: context.userId,
      action: "student.special_status.revoked",
      entity_type: "student_special_status",
      entity_id: row.id,
      metadata: { student_id: row.student_id, reason: data.reason },
    });
    return { id: String(row.id) };
  });
