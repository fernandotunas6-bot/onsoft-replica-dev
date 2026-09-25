import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["Administrador", "Secretaria", "Professor"] as const;

export type RiskIntervention = {
  id: string;
  kind: string;
  description: string;
  outcome: string | null;
  risk_level: string | null;
  average_snapshot: number | null;
  created_at: string;
};

export type RiskCase = {
  id: string;
  enrollment_id: string;
  class_group_id: string | null;
  student_name: string;
  class_group_name: string | null;
  risk_level: string;
  reasons: string[];
  suggested_interventions: string[];
  baseline_average: number | null;
  latest_average: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  interventions: RiskIntervention[];
};

async function ctx(userId: string) {
  const { requireSgaWriterFor, loadSgaAdminClient } =
    await import("@/integrations/supabase/sga-admin");
  const membership = await requireSgaWriterFor("pedagogica", userId, [...ROLES]);
  const db = await loadSgaAdminClient();
  return { schoolId: membership.schoolId, db };
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export const listRiskCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RiskCase[]> => {
    const { schoolId, db } = await ctx(context.userId);
    const { data: cases, error } = await db
      .from("student_risk_cases")
      .select("*")
      .eq("school_id", schoolId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Não foi possível carregar o acompanhamento.");
    const ids = (cases ?? []).map((c: { id: string }) => c.id);
    const { data: items } = ids.length
      ? await db
          .from("student_risk_interventions")
          .select("*")
          .in("case_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] };
    const byCase = new Map<string, RiskIntervention[]>();
    for (const i of items ?? []) {
      const list = byCase.get(i.case_id) ?? [];
      list.push({
        id: i.id,
        kind: i.kind,
        description: i.description,
        outcome: i.outcome,
        risk_level: i.risk_level,
        average_snapshot: num(i.average_snapshot),
        created_at: i.created_at,
      });
      byCase.set(i.case_id, list);
    }
    return (cases ?? []).map((c: Record<string, unknown>) => ({
      id: String(c["id"]),
      enrollment_id: String(c["enrollment_id"]),
      class_group_id: (c["class_group_id"] as string) ?? null,
      student_name: String(c["student_name"]),
      class_group_name: (c["class_group_name"] as string) ?? null,
      risk_level: String(c["risk_level"]),
      reasons: (c["reasons"] as string[]) ?? [],
      suggested_interventions: (c["suggested_interventions"] as string[]) ?? [],
      baseline_average: num(c["baseline_average"]),
      latest_average: num(c["latest_average"]),
      status: String(c["status"]),
      created_at: String(c["created_at"]),
      updated_at: String(c["updated_at"]),
      interventions: byCase.get(String(c["id"])) ?? [],
    }));
  });

const saveSchema = z.object({
  classGroupId: z.string().max(64),
  classGroupName: z.string().max(200),
  students: z
    .array(
      z.object({
        enrollment_id: z.string().min(1).max(64),
        name: z.string().min(1).max(200),
        risk: z.enum(["alto", "médio", "baixo"]),
        reasons: z.array(z.string().max(500)).max(10),
        interventions: z.array(z.string().max(500)).max(10),
        average: z.number().min(0).max(20).nullable(),
      }),
    )
    .max(80),
});

/** Guarda o resultado da análise da IA: cria o caso ou actualiza-o, e regista a reavaliação no histórico. */
export const saveRiskAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { schoolId, db } = await ctx(context.userId);
    const enrollmentIds = data.students.map((s) => s.enrollment_id);
    if (!enrollmentIds.length) return { saved: 0 };
    const { data: existing } = await db
      .from("student_risk_cases")
      .select("id, enrollment_id, baseline_average")
      .eq("school_id", schoolId)
      .in("enrollment_id", enrollmentIds);
    const existingBy = new Map(
      (existing ?? []).map(
        (e: { enrollment_id: string; id: string; baseline_average: unknown }) => [
          e.enrollment_id,
          e,
        ],
      ),
    );
    const rows = data.students.map((s) => {
      const prev = existingBy.get(s.enrollment_id);
      return {
        school_id: schoolId,
        enrollment_id: s.enrollment_id,
        class_group_id: data.classGroupId || null,
        student_name: s.name,
        class_group_name: data.classGroupName,
        risk_level: s.risk,
        reasons: s.reasons,
        suggested_interventions: s.interventions,
        baseline_average: prev ? prev.baseline_average : s.average,
        latest_average: s.average,
        status: s.risk === "baixo" ? "em melhoria" : "aberto",
        created_by: context.userId,
      };
    });
    const { data: upserted, error } = await db
      .from("student_risk_cases")
      .upsert(rows, { onConflict: "school_id,enrollment_id" })
      .select("id, enrollment_id");
    if (error) throw new Error("Não foi possível guardar o acompanhamento.");
    const byEnrollment = new Map(data.students.map((s) => [s.enrollment_id, s]));
    const log = (upserted ?? []).map((u: { id: string; enrollment_id: string }) => {
      const s = byEnrollment.get(u.enrollment_id)!;
      return {
        case_id: u.id,
        school_id: schoolId,
        kind: "avaliação IA",
        description: `Análise da IA: risco ${s.risk}.`,
        risk_level: s.risk,
        average_snapshot: s.average,
        created_by: context.userId,
      };
    });
    if (log.length) await db.from("student_risk_interventions").insert(log);
    return { saved: log.length };
  });

const interventionSchema = z.object({
  caseId: z.string().uuid(),
  kind: z.enum([
    "reunião encarregado",
    "tutoria",
    "aula de reforço",
    "acompanhamento psicológico",
    "nota",
  ]),
  description: z.string().trim().min(3).max(2000),
  outcome: z.string().trim().max(2000).optional().default(""),
  status: z.enum(["aberto", "em melhoria", "resolvido"]).optional(),
});

export const addRiskIntervention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => interventionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { schoolId, db } = await ctx(context.userId);
    const { data: c } = await db
      .from("student_risk_cases")
      .select("id, risk_level, latest_average")
      .eq("id", data.caseId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!c) throw new Error("Caso não encontrado.");
    const { error } = await db.from("student_risk_interventions").insert({
      case_id: c.id,
      school_id: schoolId,
      kind: data.kind,
      description: data.description,
      outcome: data.outcome || null,
      risk_level: c.risk_level,
      average_snapshot: c.latest_average,
      created_by: context.userId,
    });
    if (error) throw new Error("Não foi possível registar a intervenção.");
    if (data.status) {
      await db.from("student_risk_cases").update({ status: data.status }).eq("id", c.id);
    }
    return { ok: true };
  });
