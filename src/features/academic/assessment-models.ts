/**
 * Modelos de avaliação da escola (`assessment_rule_sets`, código DEFAULT).
 *
 * Ler: pessoal da escola. Publicar uma nova versão: Administrador com 2FA
 * (aal2), como exige a função original da base. A escrita vai por
 * `siga_publish_assessment_rule`, que só a chave de serviço executa — a função
 * de produção não é SECURITY DEFINER e a tabela só tem política de leitura.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import {
  DEFAULT_PROMOTION_RULES,
  NPP_MODES,
  RECOVERY_METHODS,
  parseCalculationOptions,
  type CalculationOptions,
  parsePromotionRules,
  type PromotionRules,
  ROUNDING_METHODS,
  validateRuleDraft,
  type AssessmentRuleVersion,
  type AssessmentScale,
  type RoundingMethod,
} from "./assessment-model";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const bool = (v: unknown) => v === true || v === "true";

const READ_ROLES = ["Administrador", "Secretaria", "Professor"] as const;
const PUBLISH_ROLES = ["Administrador"] as const;

/** O que o ecrã de notas precisa do modelo activo para calcular como a pauta oficial. */
export type ActiveAssessmentEngine = {
  continuousWeight: number;
  examWeight: number;
  roundingMethod: RoundingMethod;
  scale: AssessmentScale;
  calculation: CalculationOptions;
};

export type AssessmentModelsData = {
  scale: (AssessmentScale & { name: string }) | null;
  versions: AssessmentRuleVersion[];
  subjects: Array<{ id: string; name: string }>;
  canPublish: boolean;
};

function toRoundingMethod(value: unknown): RoundingMethod {
  return (ROUNDING_METHODS as readonly string[]).includes(str(value))
    ? (str(value) as RoundingMethod)
    : "nearest";
}

export const getAssessmentModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssessmentModelsData> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;

    const [scaleRes, rulesRes, subjectsRes] = await Promise.all([
      db
        .from("grading_scales")
        .select("name, minimum_value, maximum_value, decimal_places")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("assessment_rule_sets")
        .select(
          "id, name, version, status, continuous_weight, exam_weight, passing_value, maximum_absence_percentage, rounding_method, grade_change_requires_approval, lock_after_publication, formula, created_by, created_at",
        )
        .eq("school_id", schoolId)
        .eq("code", "DEFAULT")
        .order("version", { ascending: false })
        .limit(20),
      db
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("name"),
    ]);
    if (rulesRes.error) {
      throw publicDatabaseError(rulesRes.error, "Não foi possível ler os modelos de avaliação.");
    }

    const rules = (rulesRes.data ?? []) as Row[];
    const ruleIds = rules.map((r) => str(r.id));
    const authorIds = [...new Set(rules.map((r) => str(r.created_by)).filter(Boolean))];

    const [keysRes, peopleRes] = await Promise.all([
      ruleIds.length
        ? db
            .from("assessment_key_subjects")
            .select("rule_set_id, subject_id")
            .eq("school_id", schoolId)
            .in("rule_set_id", ruleIds)
        : Promise.resolve({ data: [] as Row[] }),
      authorIds.length
        ? db
            .from("people")
            .select("user_id, full_name, preferred_name")
            .eq("school_id", schoolId)
            .in("user_id", authorIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);

    const keysByRule = new Map<string, string[]>();
    for (const row of (keysRes.data ?? []) as Row[]) {
      const list = keysByRule.get(str(row.rule_set_id)) ?? [];
      list.push(str(row.subject_id));
      keysByRule.set(str(row.rule_set_id), list);
    }
    const names = new Map<string, string>();
    for (const row of (peopleRes.data ?? []) as Row[]) {
      names.set(str(row.user_id), str(row.preferred_name) || str(row.full_name));
    }

    const scaleRow = scaleRes.data as Row | null;
    const scale = scaleRow
      ? {
          name: str(scaleRow.name) || "Escala de notas",
          minimum: num(scaleRow.minimum_value),
          maximum: num(scaleRow.maximum_value),
          decimalPlaces: num(scaleRow.decimal_places),
        }
      : null;

    const versions: AssessmentRuleVersion[] = rules.map((r) => {
      const formula = (r.formula ?? {}) as Row;
      return {
        id: str(r.id),
        version: num(r.version),
        status: str(r.status) === "active" ? "active" : "retired",
        name: str(r.name),
        continuousWeight: num(r.continuous_weight),
        examWeight: num(r.exam_weight),
        passingValue: num(r.passing_value),
        maximumAbsencePercentage:
          r.maximum_absence_percentage == null ? null : num(r.maximum_absence_percentage),
        roundingMethod: toRoundingMethod(r.rounding_method),
        gradeChangeRequiresApproval: bool(r.grade_change_requires_approval),
        lockAfterPublication: bool(r.lock_after_publication),
        keySubjectIds: keysByRule.get(str(r.id)) ?? [],
        keySubjectsCauseFailure: formula.keySubjectsCauseFailure !== false,
        promotionRules: parsePromotionRules(formula),
        calculation: parseCalculationOptions(formula),
        createdAt: str(r.created_at),
        createdByName: names.get(str(r.created_by)) ?? null,
      };
    });

    return {
      scale,
      versions,
      subjects: ((subjectsRes.data ?? []) as Row[]).map((s) => ({
        id: str(s.id),
        name: str(s.name),
      })),
      canPublish: membership.allAppRoles.some((role) =>
        (PUBLISH_ROLES as readonly string[]).includes(role),
      ),
    };
  });

const promotionCycleSchema = z.object({
  maxFailedSubjects: z.number().int().min(0).max(30).nullable(),
  examAdmissionMinimum: z.number().nullable(),
  requiresPap: z.boolean(),
});

const publishInput = z.object({
  name: z.string().trim().max(120),
  continuousWeight: z.number().min(0).max(100),
  examWeight: z.number().min(0).max(100),
  passingValue: z.number(),
  maximumAbsencePercentage: z.number().min(0).max(100),
  roundingMethod: z.enum(ROUNDING_METHODS),
  gradeChangeRequiresApproval: z.boolean(),
  lockAfterPublication: z.boolean(),
  keySubjectIds: z.array(z.string().uuid()).max(60),
  keySubjectsCauseFailure: z.boolean(),
  promotionRules: z.object({
    primario: promotionCycleSchema,
    i_ciclo: promotionCycleSchema,
    ii_ciclo: promotionCycleSchema,
    tecnico: promotionCycleSchema,
  }),
  calculation: z.object({
    nppMode: z.enum(NPP_MODES),
    recoveryMethod: z.enum(RECOVERY_METHODS),
  }),
});

export const publishAssessmentModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => publishInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...PUBLISH_ROLES],
    );
    // A função original da base exige 2FA (private.is_aal2); aqui igual.
    if (context.claims["aal"] !== "aal2") {
      throw new Error("Publicar o modelo de avaliação exige 2FA activo nesta sessão.");
    }

    const db = await loadSgaAdminClient();
    const { data: scaleRow } = await db
      .from("grading_scales")
      .select("minimum_value, maximum_value, decimal_places")
      .eq("school_id", membership.schoolId)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const scale = scaleRow
      ? {
          minimum: num(scaleRow.minimum_value),
          maximum: num(scaleRow.maximum_value),
          decimalPlaces: num(scaleRow.decimal_places),
        }
      : null;
    const issues = validateRuleDraft(data, scale);
    if (issues.length) throw new Error(issues[0].message);

    const keySubjectIds = [...new Set(data.keySubjectIds)];
    const { data: result, error } = await db.rpc(
      "siga_publish_assessment_rule" as never,
      {
        target_school_id: membership.schoolId,
        actor: context.userId,
        rule_name: data.name,
        continuous_weight_value: data.continuousWeight,
        exam_weight_value: data.examWeight,
        passing_grade_value: data.passingValue,
        maximum_absence_value: data.maximumAbsencePercentage,
        rounding_method_value: data.roundingMethod,
        require_change_approval: data.gradeChangeRequiresApproval,
        lock_after_publication_value: data.lockAfterPublication,
        key_subject_ids: keySubjectIds,
        key_subjects_cause_failure: data.keySubjectsCauseFailure,
        promotion_rules: data.promotionRules,
        calculation_options: data.calculation,
      } as never,
    );
    if (error) {
      if (/could not find the function|does not exist/i.test(error.message ?? "")) {
        throw new Error(
          "Falta aplicar a migração dos modelos de avaliação (20260926200000) na base de dados.",
        );
      }
      throw publicDatabaseError(error, "Não foi possível publicar o modelo de avaliação.");
    }
    // O motor da pauta conta a NPP pelo tipo do item: alinhar os diários ainda
    // abertos com a opção agora publicada (os fechados ficam como foram
    // calculados).
    const { data: openBooks } = await db
      .from("gradebooks")
      .select("id")
      .eq("school_id", membership.schoolId)
      .neq("status", "closed");
    const bookIds = (openBooks ?? []).map((b) => str(b.id));
    if (bookIds.length) {
      const { error: kindError } = await db
        .from("grade_items")
        .update({
          kind: data.calculation.nppMode === "in_continuous" ? "continuous" : "informative",
        })
        .eq("school_id", membership.schoolId)
        .eq("code", "NPP")
        .in("gradebook_id", bookIds);
      if (kindError) console.warn("[assessment-models] NPP kind:", kindError.message);
    }
    return result as { ruleSetId: string; version: number };
  });

/**
 * Nota de aprovação em vigor: a do modelo de avaliação publicado (a mesma que
 * a pauta oficial usa). `null` se a escola ainda não tem modelo — aí os ecrãs
 * usam a das Definições. Qualquer membro da escola pode ler (é só um número).
 */
export const getActivePassingValue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      passingValue: number | null;
      promotionRules: PromotionRules;
      engine: ActiveAssessmentEngine | null;
    }> => {
      const membership = await resolveSgaMembershipAdmin(context.userId);
      if (!membership) {
        return { passingValue: null, promotionRules: DEFAULT_PROMOTION_RULES, engine: null };
      }
      const db = await loadSgaAdminClient();
      const { data } = await db
        .from("assessment_rule_sets")
        .select(
          "passing_value, formula, continuous_weight, exam_weight, rounding_method, grading_scale_id",
        )
        .eq("school_id", membership.schoolId)
        .eq("code", "DEFAULT")
        .eq("status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const value = data?.passing_value == null ? NaN : Number(data.passing_value);
      let engine: ActiveAssessmentEngine | null = null;
      if (data) {
        const { data: scaleRow } = data.grading_scale_id
          ? await db
              .from("grading_scales")
              .select("minimum_value, maximum_value, decimal_places")
              .eq("school_id", membership.schoolId)
              .eq("id", data.grading_scale_id)
              .maybeSingle()
          : { data: null };
        engine = {
          continuousWeight: num(data.continuous_weight),
          examWeight: num(data.exam_weight),
          roundingMethod: toRoundingMethod(data.rounding_method),
          scale: scaleRow
            ? {
                minimum: num(scaleRow.minimum_value),
                maximum: num(scaleRow.maximum_value),
                decimalPlaces: num(scaleRow.decimal_places),
              }
            : { minimum: 0, maximum: 20, decimalPlaces: 1 },
          calculation: parseCalculationOptions(data.formula),
        };
      }
      return {
        passingValue: Number.isFinite(value) ? value : null,
        promotionRules: parsePromotionRules(data?.formula),
        engine,
      };
    },
  );
