import { foldForCompare, normalizeMoney, normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import {
  parseSettingsDomain,
  updateSettingsDomainValue,
  type BillingSettings,
} from "@/features/school/settings-domains";
import { gradeTuitionCode, isMissingGradeColumn, toFeeItemRow } from "@/features/finance/fee-items";
import { dynamicTablesClient } from "@/integrations/supabase/sga";
import { normalizeGrade } from "@/features/education-catalog/normalize";

/**
 * Importação de «propinas» (2026-10-04):
 *  - regras de cobrança (Definições › Cobrança: `school_settings`, domínio `billing`),
 *    só o que vem no ficheiro. Até 2026-10-04 gravava em `school_billing_settings`,
 *    que nada lê, e um ficheiro sem a coluna da multa gravava 10 %;
 *  - o preçário do modelo oficial: cada linha com classe (e curso) e valor grava o
 *    preço da propina dessa classe no plano activo (`fee_items.grade_level_id`, ver
 *    finance/fee-items.ts). A taxa de multa diária não se aplica: no SIGA a multa é
 *    única, em % da fatura.
 */
type GradeRef = { id: string; name: string; code: string; programId: string | null };
type ProgramRef = { id: string; name: string; code: string };

type PropinasCache = ImportRefCache & {
  hasBillingRules: boolean;
  /** Plano de propinas activo (null: a escola ainda não activou o plano). */
  planId: string | null;
  grades: GradeRef[];
  programs: ProgramRef[];
  /** Itens de propina por classe já no plano, por classe. */
  gradeItemIdByGrade: Map<string, string>;
  /** false enquanto a base não tiver `fee_items.grade_level_id` (20261005150000). */
  gradePricing: boolean;
};

const PACKAGE_MISSING =
  "Os preços por classe ainda não estão disponíveis nesta base: falta aplicar docs/agents/SIGA_aplicar_propina_por_classe.sql.";

type RuleField = "due_day" | "late_fee_percent" | "grace_days" | "sibling_discount_percent";

/** Colunas aceites por regra e os limites de Definições › Cobrança (settings-domains.ts). */
const RULE_FIELDS: Record<
  RuleField,
  { keys: string[]; min: number; max: number; integer: boolean; label: string }
> = {
  due_day: {
    keys: ["due_day", "dia_vencimento", "dia_limite", "vencimento"],
    min: 1,
    max: 28,
    integer: true,
    label: "Dia de vencimento",
  },
  late_fee_percent: {
    keys: ["late_fee_percent", "multa", "percentual_multa"],
    min: 0,
    max: 100,
    integer: false,
    label: "Multa por atraso (%)",
  },
  grace_days: {
    keys: ["grace_days", "dias_carencia", "tolerancia"],
    min: 0,
    max: 60,
    integer: true,
    label: "Tolerância (dias)",
  },
  sibling_discount_percent: {
    keys: ["sibling_discount_percent", "desconto_irmao"],
    min: 0,
    max: 100,
    integer: false,
    label: "Desconto de irmãos (%)",
  },
};

/** «Todos», «Todas», «Geral»: o curso não restringe a classe. */
const ANY_COURSE = new Set(["todos", "todas", "geral", "todos os cursos", "-"]);

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

/** As regras que a linha traz (só essas) e os erros de limites. */
function rulesFromRow(row: Record<string, unknown>) {
  const values: Partial<Record<RuleField, number>> = {};
  const errors: string[] = [];
  for (const [field, spec] of Object.entries(RULE_FIELDS) as Array<
    [RuleField, (typeof RULE_FIELDS)[RuleField]]
  >) {
    const raw = valueOf(row, ...spec.keys);
    if (raw === null) continue;
    const value = Number(String(raw).trim().replace(",", "."));
    if (
      !Number.isFinite(value) ||
      value < spec.min ||
      value > spec.max ||
      (spec.integer && !Number.isInteger(value))
    ) {
      errors.push(
        `${spec.label} deve ser ${spec.integer ? "um número inteiro " : ""}entre ${spec.min} e ${spec.max}.`,
      );
      continue;
    }
    values[field] = value;
  }
  return { values, errors };
}

type RowPrice = { grade: GradeRef; amount: number; title: string | null };

/**
 * O preço da linha: a classe (pelo nome ou código, no curso indicado) e o valor.
 * `price` é null quando a linha não traz preço ou quando ele tem erros.
 */
function priceFromRow(
  row: Record<string, unknown>,
  cache: Partial<PropinasCache>,
): { price: RowPrice | null; errors: string[] } {
  const gradeText = valueOf(row, "grade_level", "classe");
  const amountRaw = valueOf(row, "amount", "valor", "valor_mensal");
  if (gradeText === null && amountRaw === null) return { price: null, errors: [] };
  const errors: string[] = [];
  const amount = normalizeMoney(amountRaw);
  if (amount === null || !(amount > 0)) {
    errors.push("Indique o valor mensal da propina (maior que zero).");
  }
  if (gradeText === null) {
    errors.push("Indique a classe a que se aplica o valor.");
    return { price: null, errors };
  }
  const courseText = valueOf(row, "course", "curso");
  const course = courseText === null ? "" : foldForCompare(courseText);
  const programIds =
    course && !ANY_COURSE.has(course)
      ? new Set(
          (cache.programs ?? [])
            .filter((p) => foldForCompare(p.name) === course || foldForCompare(p.code) === course)
            .map((p) => p.id),
        )
      : null;
  if (programIds && programIds.size === 0) {
    errors.push(`Curso «${normalizeText(courseText)}» não encontrado nesta escola.`);
    return { price: null, errors };
  }
  const grade = foldForCompare(gradeText);
  const candidates = (cache.grades ?? []).filter(
    (g) => !programIds || (g.programId !== null && programIds.has(g.programId)),
  );
  let matches = candidates.filter(
    (g) => foldForCompare(g.name) === grade || foldForCompare(g.code) === grade,
  );
  // «10a classe», «décima classe» → «10ª Classe»: a mesma classe escrita de
  // outra forma (número e unidade), como nas turmas.
  if (matches.length === 0) {
    const wanted = normalizeGrade(normalizeText(gradeText));
    if (wanted) {
      matches = candidates.filter((g) => {
        const own = normalizeGrade(g.name) ?? normalizeGrade(g.code);
        return own?.n === wanted.n && own.unit === wanted.unit;
      });
    }
  }
  if (matches.length === 0) {
    errors.push(`Classe «${normalizeText(gradeText)}» não encontrada nesta escola.`);
    return { price: null, errors };
  }
  if (matches.length > 1) {
    errors.push(
      `A classe «${normalizeText(gradeText)}» existe em mais de um curso: indique o curso.`,
    );
    return { price: null, errors };
  }
  if (errors.length) return { price: null, errors };
  const title = valueOf(row, "title", "designacao");
  return {
    price: { grade: matches[0]!, amount: amount!, title: title ? normalizeText(title) : null },
    errors,
  };
}

export const propinasImporter: RowImporter = {
  module: "propinas",

  async loadRefCache(ctx) {
    const [{ data: rules }, { data: plan }, { data: grades }, { data: programs }] =
      await Promise.all([
        ctx.db
          .from("school_settings")
          .select("id")
          .eq("school_id", ctx.schoolId)
          .eq("domain", "billing")
          .maybeSingle(),
        ctx.db
          .from("fee_plans")
          .select("id")
          .eq("school_id", ctx.schoolId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
        ctx.db
          .from("grade_levels")
          .select("id, name, code, program_id")
          .eq("school_id", ctx.schoolId)
          .eq("is_active", true),
        ctx.db.from("programs").select("id, name, code").eq("school_id", ctx.schoolId),
      ]);
    const planId = plan?.id ? String(plan.id) : null;
    const gradeItemIdByGrade = new Map<string, string>();
    // Sem tipos: `fee_items.grade_level_id` só existe depois de 20261005150000.
    const { error: columnError } = await dynamicTablesClient(ctx.db as never)
      .from("fee_items")
      .select("grade_level_id")
      .limit(1);
    const gradePricing = !isMissingGradeColumn(columnError);
    if (planId) {
      // `select("*")`: a coluna da classe só existe depois de 20261005150000.
      const { data: items } = await ctx.db
        .from("fee_items")
        .select("*")
        .eq("school_id", ctx.schoolId)
        .eq("fee_plan_id", planId)
        .eq("kind", "tuition");
      for (const row of items ?? []) {
        const item = toFeeItemRow(row as Record<string, unknown>);
        if (item.grade_level_id) gradeItemIdByGrade.set(item.grade_level_id, item.id);
      }
    }

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      hasBillingRules: Boolean(rules?.id),
      planId,
      grades: (grades ?? []).map((g) => ({
        id: String(g.id),
        name: String(g.name),
        code: String(g.code ?? ""),
        programId: g.program_id ? String(g.program_id) : null,
      })),
      programs: (programs ?? []).map((p) => ({
        id: String(p.id),
        name: String(p.name),
        code: String(p.code ?? ""),
      })),
      gradeItemIdByGrade,
      gradePricing,
    } as PropinasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as Partial<PropinasCache>;
    const { values, errors } = rulesFromRow(normalized);
    const { price, errors: priceErrors } = priceFromRow(normalized, cache);
    errors.push(...priceErrors);
    const warnings: string[] = [];
    if (valueOf(normalized, "penalty_rate")) {
      warnings.push(
        "A taxa de multa diária não é aplicada: no SIGA a multa é única, em % da fatura (coluna «multa»).",
      );
    }
    if (price && !cache.planId) {
      errors.push(
        "Active primeiro o plano de propinas (Definições › Cobrança › Plano de propinas).",
      );
    } else if (price && cache.gradePricing === false) {
      errors.push(PACKAGE_MISSING);
    }
    if (!errors.length && !price && Object.keys(values).length === 0) {
      errors.push(
        "A linha não traz regras de cobrança (dia de vencimento, multa, tolerância ou desconto de irmãos) nem o preço de uma classe.",
      );
    }
    if (errors.length) return { status: "error", warnings, errors };
    return { status: warnings.length ? "warning" : "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as PropinasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }
    const { values } = rulesFromRow(normalized);
    const { price } = priceFromRow(normalized, cache);

    if (ctx.dryRun) {
      const updates =
        (Object.keys(values).length > 0 && cache.hasBillingRules) ||
        (price !== null && cache.gradeItemIdByGrade?.has(price.grade.id));
      return {
        status: updates ? "will_update" : "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
      };
    }

    const fail = (message: string) => ({
      status: "error" as const,
      warnings: analysis.warnings,
      errors: [message],
      audits: [],
    });

    if (Object.keys(values).length > 0) {
      // Mesma gravação do ecrã (versão bloqueada): as regras actuais, com as da linha por cima.
      try {
        await updateSettingsDomainValue(
          ctx.db,
          ctx.schoolId,
          "billing",
          (current): BillingSettings => ({ ...parseSettingsDomain("billing", current), ...values }),
          ctx.userId,
        );
      } catch (error) {
        return fail(
          `Erro ao gravar as regras de cobrança: ${error instanceof Error ? error.message : "falha desconhecida"}`,
        );
      }
      cache.hasBillingRules = true;
    }

    if (price && cache.planId) {
      const name = (price.title ?? `Propina mensal — ${price.grade.name}`).slice(0, 120);
      const existingId = cache.gradeItemIdByGrade.get(price.grade.id);
      // Sem tipos: `fee_items.grade_level_id` só existe depois de 20261005150000.
      const items = dynamicTablesClient(ctx.db as never);
      if (existingId) {
        const { error } = await items
          .from("fee_items")
          .update({ amount: price.amount, name, is_active: true })
          .eq("school_id", ctx.schoolId)
          .eq("id", existingId);
        if (error) return fail(`Erro ao gravar o preço da classe: ${error.message}`);
      } else {
        const { data, error } = await items
          .from("fee_items")
          .insert({
            school_id: ctx.schoolId,
            fee_plan_id: cache.planId,
            code: gradeTuitionCode(price.grade.id),
            name,
            kind: "tuition",
            frequency: "monthly",
            amount: price.amount,
            is_active: true,
            grade_level_id: price.grade.id,
          })
          .select("id")
          .single();
        if (error || !data) {
          return fail(
            isMissingGradeColumn(error)
              ? PACKAGE_MISSING
              : `Erro ao gravar o preço da classe: ${error?.message ?? "falha desconhecida"}`,
          );
        }
        cache.gradeItemIdByGrade.set(price.grade.id, String(data.id));
      }
    }

    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
    };
  },
};
