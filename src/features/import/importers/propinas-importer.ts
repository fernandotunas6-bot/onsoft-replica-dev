import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import {
  parseSettingsDomain,
  updateSettingsDomainValue,
  type BillingSettings,
} from "@/features/school/settings-domains";

/**
 * Parâmetros de cobrança da escola (Definições › Cobrança: `school_settings`, domínio
 * `billing`). Até 2026-10-04 gravava em `school_billing_settings`, que nada lê, e um
 * ficheiro sem a coluna da multa gravava 10 % por omissão. Agora só muda o que vem no
 * ficheiro; o resto das regras fica como está.
 */
type PropinasCache = ImportRefCache & {
  hasBillingRules: boolean;
};

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

/** Avisos para colunas do modelo de preçário que estas regras não usam. */
function ignoredColumnsWarnings(row: Record<string, unknown>) {
  const warnings: string[] = [];
  if (valueOf(row, "amount", "title")) {
    warnings.push(
      "Os valores das propinas não são importados aqui: defina-os em Definições › Cobrança › Plano de propinas.",
    );
  }
  if (valueOf(row, "penalty_rate")) {
    warnings.push(
      "A taxa de multa diária não é aplicada: no SIGA a multa é única, em % da fatura (coluna «multa»).",
    );
  }
  return warnings;
}

export const propinasImporter: RowImporter = {
  module: "propinas",

  async loadRefCache(ctx) {
    const { data } = await ctx.db
      .from("school_settings")
      .select("id")
      .eq("school_id", ctx.schoolId)
      .eq("domain", "billing")
      .maybeSingle();

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      hasBillingRules: Boolean(data?.id),
    } as PropinasCache;
  },

  analyzeRow(normalized) {
    const { values, errors } = rulesFromRow(normalized);
    const warnings = ignoredColumnsWarnings(normalized);
    if (!errors.length && Object.keys(values).length === 0) {
      errors.push(
        "A linha não traz regras de cobrança (dia de vencimento, multa, tolerância ou desconto de irmãos).",
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

    if (ctx.dryRun) {
      return {
        status: cache.hasBillingRules ? "will_update" : "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
      };
    }

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
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [
          `Erro ao gravar as regras de cobrança: ${error instanceof Error ? error.message : "falha desconhecida"}`,
        ],
        audits: [],
      };
    }

    cache.hasBillingRules = true;
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
    };
  },
};
