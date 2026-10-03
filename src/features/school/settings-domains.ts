/**
 * Domínios de configuração da escola (`school_settings`: uma linha por
 * escola × domínio, com o valor em JSON). Este ficheiro é o ponto único de
 * verdade sobre o que cada domínio guarda e qual é o valor por omissão.
 *
 * Porquê: cada módulo lia o JSON à mão, com o seu próprio «?? valor». O ecrã
 * de Cobrança mostrava multa 2 %, tolerância 5 dias e desconto de irmãos 10 %
 * quando a escola nunca tinha gravado nada — mas a cobrança aplicava 0 em
 * todos (91 escolas assim na produção, 2026-10-03). A escola via uma regra
 * que não existia.
 *
 * Regras:
 * - Leitura tolerante, campo a campo: um valor inválido cai para o valor por
 *   omissão desse campo, sem deitar fora o resto do domínio.
 * - Valores por omissão de dinheiro são 0 («não definido»): multa e desconto
 *   só existem quando a escola os escolhe.
 * - Quem lê um domínio usa `readSettingsDomain`/`parseSettingsDomain`; não se
 *   volta a escrever `value["campo"] ?? x` noutro sítio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSchoolTypeId, type AngolaSchoolTypeId } from "@/lib/school-config";
import { pedagogySettingsSchema, type PedagogySettings } from "./schemas";

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const optionalText = (value: unknown) => {
  const t = text(value);
  return t ? t : null;
};

function bounded(value: unknown, fallback: number, min: number, max: number, integer = false) {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  const clamped = Math.min(Math.max(n, min), max);
  return integer ? Math.round(clamped) : clamped;
}

export type BillingSettings = {
  /** Dia do mês em que a propina vence (1–28). */
  due_day: number;
  /** Multa por atraso, em % da factura. 0 = sem multa. */
  late_fee_percent: number;
  /** Dias depois do vencimento antes de aplicar a multa. */
  grace_days: number;
  /** Desconto quando outro educando do mesmo encarregado está matriculado. 0 = sem desconto. */
  sibling_discount_percent: number;
};

export type BankingSettings = {
  bank_name: string;
  account_holder: string;
  iban: string;
  swift: string;
  multicaixa_merchant: string;
};

export type AgtSettings = {
  software_certified: string;
  invoice_series: string;
  fiscal_notes: string;
};

export type InstitutionSettings = {
  school_type: AngolaSchoolTypeId | null;
  philosophy: string | null;
};

export type BrandingSettings = { logo_url: string | null; motto: string | null };

export type AcademicSettings = {
  director_name: string | null;
  /** 2 (semestres) ou 3 (trimestres). */
  evaluation_periods: number;
  /** Valor de referência quando a escola ainda não tem modelo de avaliação activo. */
  passing_grade: number;
};

export const SETTINGS_DOMAINS = {
  billing: {
    label: "Cobrança",
    parse: (value: unknown): BillingSettings => {
      const v = asRecord(value);
      return {
        due_day: bounded(v["due_day"], 10, 1, 28, true),
        late_fee_percent: bounded(v["late_fee_percent"], 0, 0, 100),
        grace_days: bounded(v["grace_days"], 0, 0, 60, true),
        sibling_discount_percent: bounded(v["sibling_discount_percent"], 0, 0, 100),
      };
    },
  },
  banking: {
    label: "Dados bancários",
    parse: (value: unknown): BankingSettings => {
      const v = asRecord(value);
      return {
        bank_name: text(v["bank_name"]),
        account_holder: text(v["account_holder"]),
        iban: text(v["iban"]),
        swift: text(v["swift"]),
        multicaixa_merchant: text(v["multicaixa_merchant"]),
      };
    },
  },
  agt: {
    label: "AGT",
    parse: (value: unknown): AgtSettings => {
      const v = asRecord(value);
      return {
        software_certified: text(v["software_certified"]),
        invoice_series: text(v["invoice_series"]),
        fiscal_notes: text(v["fiscal_notes"]),
      };
    },
  },
  institution: {
    label: "Instituição",
    parse: (value: unknown): InstitutionSettings => {
      const v = asRecord(value);
      return {
        school_type: isSchoolTypeId(v["school_type"]) ? v["school_type"] : null,
        philosophy: optionalText(v["philosophy"]),
      };
    },
  },
  branding: {
    label: "Identidade visual",
    parse: (value: unknown): BrandingSettings => {
      const v = asRecord(value);
      return { logo_url: optionalText(v["logo_url"]), motto: optionalText(v["motto"]) };
    },
  },
  academic: {
    label: "Académico",
    parse: (value: unknown): AcademicSettings => {
      const v = asRecord(value);
      const periods = bounded(v["evaluation_periods"], 3, 2, 3, true);
      return {
        director_name: optionalText(v["director_name"]),
        evaluation_periods: periods,
        passing_grade: bounded(v["passing_grade"], 10, 0, 20),
      };
    },
  },
  pedagogy: {
    label: "Pedagógico",
    parse: (value: unknown): PedagogySettings =>
      pedagogySettingsSchema.safeParse(asRecord(value)).data ?? {
        teachingLevels: [],
        courses: [],
        closedTerms: [],
        gradingProfile: null,
      },
  },
  preferences: {
    label: "Preferências",
    parse: (value: unknown): Record<string, boolean> =>
      Object.fromEntries(
        Object.entries(asRecord(value)).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
        ),
      ),
  },
} as const;

export type SettingsDomainId = keyof typeof SETTINGS_DOMAINS;
export type SettingsDomainValue<D extends SettingsDomainId> = ReturnType<
  (typeof SETTINGS_DOMAINS)[D]["parse"]
>;

export function parseSettingsDomain<D extends SettingsDomainId>(
  domain: D,
  value: unknown,
): SettingsDomainValue<D> {
  return SETTINGS_DOMAINS[domain].parse(value) as SettingsDomainValue<D>;
}

/** Lê e interpreta um domínio. Sem linha (ou erro de leitura): valores por omissão. */
export async function readSettingsDomain<D extends SettingsDomainId>(
  db: SupabaseClient,
  schoolId: string,
  domain: D,
): Promise<SettingsDomainValue<D>> {
  const { data } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", domain)
    .maybeSingle();
  return parseSettingsDomain(domain, data?.value);
}
