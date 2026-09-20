import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";

type PropinasCache = ImportRefCache & {
  existingSettingsId: string | null;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

export const propinasImporter: RowImporter = {
  module: "propinas",

  async loadRefCache(ctx) {
    const { data } = await ctx.db
      .from("school_billing_settings")
      .select("id")
      .eq("school_id", ctx.schoolId)
      .maybeSingle();

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      existingSettingsId: data?.id ? String(data.id) : null,
    } as PropinasCache;
  },

  analyzeRow(normalized, rawCache) {
    const errors: string[] = [];
    const warnings: string[] = [];

    const dueDayVal = valueOf(normalized, "due_day", "dia_vencimento", "dia_limite", "vencimento");
    const dueDay = Number(dueDayVal ?? 10);

    if (dueDay < 1 || dueDay > 31) {
      errors.push("Dia de vencimento deve ser entre 1 e 31.");
    }

    const lateFeeVal = valueOf(normalized, "late_fee_percent", "multa", "percentual_multa");
    const lateFee = Number(lateFeeVal ?? 10);
    if (lateFee < 0 || lateFee > 100) {
      errors.push("Percentual de multa por atraso deve ser entre 0 e 100%.");
    }

    if (errors.length) return { status: "error", warnings, errors };

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as PropinasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const dueDay = Number(
      valueOf(normalized, "due_day", "dia_vencimento", "dia_limite", "vencimento") ?? 10,
    );
    const lateFee = Number(
      valueOf(normalized, "late_fee_percent", "multa", "percentual_multa") ?? 10,
    );
    const graceDays = Number(valueOf(normalized, "grace_days", "dias_carencia", "tolerancia") ?? 5);
    const siblingDiscount = Number(
      valueOf(normalized, "sibling_discount_percent", "desconto_irmao") ?? 0,
    );

    if (ctx.dryRun) {
      return {
        status: cache.existingSettingsId ? "will_update" : "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: cache.existingSettingsId,
      };
    }

    if (cache.existingSettingsId) {
      const { error } = await ctx.db
        .from("school_billing_settings")
        .update({
          due_day: dueDay,
          late_fee_percent: lateFee,
          grace_days: graceDays,
          sibling_discount_percent: siblingDiscount,
        })
        .eq("id", cache.existingSettingsId)
        .eq("school_id", ctx.schoolId);

      if (error) {
        return {
          status: "error",
          warnings: analysis.warnings,
          errors: [`Erro ao actualizar parâmetros de propinas: ${error.message}`],
          audits: [],
        };
      }

      return {
        status: "imported",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: cache.existingSettingsId,
      };
    }

    const { data, error } = await ctx.db
      .from("school_billing_settings")
      .insert({
        school_id: ctx.schoolId,
        due_day: dueDay,
        late_fee_percent: lateFee,
        grace_days: graceDays,
        sibling_discount_percent: siblingDiscount,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar parâmetros de propinas: ${error.message}`],
        audits: [],
      };
    }

    cache.existingSettingsId = String(data.id);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: String(data.id),
    };
  },
};
