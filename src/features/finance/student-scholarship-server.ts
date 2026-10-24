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
import { schoolTodayIso } from "@/lib/school-date";
import { scholarshipInForce, type ScholarshipRow } from "./scholarships";

/**
 * Bolsas de estudo (`student_scholarships`): só o servidor lhes toca. A Secretaria lê;
 * conceder e revogar é da Administração e da Tesouraria, com 2FA e auditoria.
 */

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
const READERS = ["Administrador", "Tesouraria", "Secretaria"] as const;
const WRITERS = ["Administrador", "Tesouraria"] as const;

const missingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /student_scholarships/.test(error.message ?? "")),
  );

/** Bolsas não revogadas do estudante (vazio enquanto a tabela não existir). */
export async function scholarshipsOfStudent(
  db: Db,
  schoolId: string,
  studentId: string,
): Promise<ScholarshipRow[]> {
  const { data, error } = await db
    .from("student_scholarships")
    .select("percent, scope, valid_from, valid_until, revoked_at")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .is("revoked_at", null);
  if (error) {
    if (missingTable(error)) return [];
    throw publicDatabaseError(error, "Não foi possível ler a bolsa do estudante.");
  }
  return (data ?? []) as ScholarshipRow[];
}

const studentInput = z.object({ studentId: z.string().uuid() });

export const getStudentScholarships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => studentInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      ...READERS,
    ]);
    const db = await loadSgaAdminClient();
    const { data: rows, error } = await db
      .from("student_scholarships")
      .select(
        "id, kind, percent, scope, sponsor, valid_from, valid_until, evidence_note, revoked_at, revoke_reason, created_at",
      )
      .eq("school_id", membership.schoolId)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });
    if (error) {
      if (missingTable(error)) return { available: false as const, canWrite: false, rows: [] };
      throw publicDatabaseError(error, "Não foi possível ler as bolsas do estudante.");
    }
    const today = schoolTodayIso();
    return {
      available: true as const,
      canWrite: (membership.allAppRoles ?? [membership.appRole]).some((role) =>
        (WRITERS as readonly string[]).includes(role),
      ),
      rows: (rows ?? []).map((row) => ({
        ...row,
        percent: Number(row.percent),
        inForce: scholarshipInForce(row as ScholarshipRow, today),
      })),
    };
  });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const grantInput = z
  .object({
    studentId: z.string().uuid(),
    kind: z.enum(["merit", "social", "staff", "institutional", "other"]),
    percent: z.number().gt(0).max(100),
    scope: z.enum(["tuition", "all"]),
    sponsor: z.string().trim().max(200).optional().default(""),
    validFrom: isoDate,
    validUntil: isoDate.nullable().optional(),
    evidenceNote: z
      .string()
      .trim()
      .min(3, "Indique a prova (acta, despacho, protocolo…).")
      .max(1000),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.validFrom, {
    message: "A data de fim tem de ser depois do início.",
  });

export const grantScholarship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => grantInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Conceder uma bolsa de estudo");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...WRITERS],
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
      .from("student_scholarships")
      .insert({
        school_id: membership.schoolId,
        student_id: data.studentId,
        kind: data.kind,
        percent: data.percent,
        scope: data.scope,
        sponsor: data.sponsor || null,
        valid_from: data.validFrom,
        valid_until: data.validUntil ?? null,
        evidence_note: data.evidenceNote,
        granted_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (missingTable(error)) {
        throw new Error(
          "As bolsas ainda não estão disponíveis nesta base: falta aplicar a migração 20261005160000_student_scholarships.",
        );
      }
      if (error.code === "23505") {
        throw new Error("Este estudante já tem uma bolsa em vigor. Revogue-a antes de dar outra.");
      }
      throw publicDatabaseError(error, "Não foi possível conceder a bolsa.");
    }
    await db.from("audit_logs").insert({
      school_id: membership.schoolId,
      actor_user_id: context.userId,
      action: "finance.scholarship.granted",
      entity_type: "student_scholarship",
      entity_id: row.id,
      metadata: {
        student_id: data.studentId,
        kind: data.kind,
        percent: data.percent,
        scope: data.scope,
        valid_from: data.validFrom,
        valid_until: data.validUntil ?? null,
      },
    });
    return { id: String(row.id) };
  });

const revokeInput = z.object({
  scholarshipId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const revokeScholarship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => revokeInput.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Revogar uma bolsa de estudo");
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      [...WRITERS],
    );
    const db = await loadSgaAdminClient();
    const { data: row, error } = await db
      .from("student_scholarships")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
        revoke_reason: data.reason,
      })
      .eq("school_id", membership.schoolId)
      .eq("id", data.scholarshipId)
      .is("revoked_at", null)
      .select("id, student_id")
      .maybeSingle();
    if (error) {
      if (missingTable(error)) throw new Error("As bolsas ainda não estão disponíveis nesta base.");
      throw publicDatabaseError(error, "Não foi possível revogar a bolsa.");
    }
    if (!row) throw new Error("Bolsa não encontrada ou já revogada.");
    await db.from("audit_logs").insert({
      school_id: membership.schoolId,
      actor_user_id: context.userId,
      action: "finance.scholarship.revoked",
      entity_type: "student_scholarship",
      entity_id: row.id,
      metadata: { student_id: row.student_id, reason: data.reason },
    });
    return { id: String(row.id) };
  });
