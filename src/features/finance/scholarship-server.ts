/**
 * Bolsas e descontos por aluno.
 *
 * O contrato financeiro da matrícula (`finance_contracts.discount_percentage`) já dava o
 * desconto de cada fatura emitida (`issueInvoice`), mas só o desconto de irmãos o
 * preenchia, ao criar o contrato. Uma bolsa (mérito, social, funcionário…) não tinha
 * onde ficar: a tesouraria descontava fatura a fatura, à mão.
 *
 * Aqui a Direcção ou a Tesouraria define a percentagem do contrato, com motivo, 2FA e
 * auditoria. Vale para as faturas emitidas a partir daí; as já emitidas não mudam.
 * Sem migração: a coluna existe e o motivo fica em `audit_logs`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAal2 } from "@/features/hr/require-aal2";
import { recordAccessAudit } from "@/features/audit/record-audit";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";

export const SCHOLARSHIP_ACTION = "finance.scholarship.set";

const studentInput = z.object({ studentId: z.string().uuid() });

export const setScholarshipInputSchema = studentInput.extend({
  /** Percentagem do desconto (0 = sem bolsa), com cêntimos de ponto percentual. */
  percent: z
    .number()
    .min(0)
    .max(100)
    .refine((value) => Math.round(value * 100) === value * 100, "No máximo duas casas decimais."),
  reason: z.string().trim().min(3, "Indique o motivo da bolsa ou do desconto.").max(300),
});

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** Matrícula activa e contrato activo do aluno nesta escola (o contrato pode não existir). */
async function loadContract(db: Db, schoolId: string, studentId: string) {
  const { data: enrollment, error: enrollmentError } = await db
    .from("enrollments")
    .select("id")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (enrollmentError)
    throw publicDatabaseError(enrollmentError, "Não foi possível ler a matrícula.");
  if (!enrollment?.id) return { enrollmentId: null, contract: null };
  const { data: contract, error: contractError } = await db
    .from("finance_contracts")
    .select("id, discount_percentage")
    .eq("school_id", schoolId)
    .eq("enrollment_id", enrollment.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (contractError) throw publicDatabaseError(contractError, "Não foi possível ler o contrato.");
  return { enrollmentId: String(enrollment.id), contract };
}

export type StudentScholarship = {
  /** Desconto do contrato em vigor (bolsa ou irmãos). */
  percent: number;
  /** false: o aluno não tem matrícula activa, não há onde gravar. */
  enrolled: boolean;
};

export const getStudentScholarship = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => studentInput.parse(input))
  .handler(async ({ data, context }): Promise<StudentScholarship> => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { enrollmentId, contract } = await loadContract(db, membership.schoolId, data.studentId);
    return {
      percent: Number(contract?.discount_percentage ?? 0),
      enrolled: Boolean(enrollmentId),
    };
  });

export const setStudentScholarship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setScholarshipInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<StudentScholarship> => {
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador", "Tesouraria"],
    );
    requireAal2(context.claims, "Atribuir uma bolsa ou desconto");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { enrollmentId, contract } = await loadContract(db, schoolId, data.studentId);
    if (!enrollmentId) {
      throw new Error("O aluno não tem matrícula activa: atribua primeiro uma turma.");
    }
    const before = Number(contract?.discount_percentage ?? 0);

    let contractId: string;
    if (contract?.id) {
      const { data: updated, error } = await db
        .from("finance_contracts")
        .update({ discount_percentage: data.percent })
        .eq("school_id", schoolId)
        .eq("id", contract.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
      if (error) throw publicDatabaseError(error, "Não foi possível gravar a bolsa.");
      if (!updated) throw new Error("O contrato mudou entretanto. Volte a abrir a ficha do aluno.");
      contractId = String(contract.id);
    } else {
      // Sem contrato ainda (nenhuma fatura emitida): cria-o já com a bolsa, como a
      // emissão da primeira fatura faria.
      const { data: plan } = await db
        .from("fee_plans")
        .select("id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!plan?.id) {
        throw new Error("Active primeiro o plano de propinas (Definições › Cobrança).");
      }
      const { data: created, error } = await db
        .from("finance_contracts")
        .insert({
          school_id: schoolId,
          enrollment_id: enrollmentId,
          fee_plan_id: plan.id,
          discount_percentage: data.percent,
          status: "active",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error || !created) {
        throw publicDatabaseError(
          error ?? { message: "sem contrato" },
          "Não foi possível gravar a bolsa.",
        );
      }
      contractId = String(created.id);
    }

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: SCHOLARSHIP_ACTION,
      entityType: "student",
      entityId: data.studentId,
      metadata: { contract_id: contractId, before, after: data.percent, reason: data.reason },
    });
    return { percent: data.percent, enrolled: true };
  });
