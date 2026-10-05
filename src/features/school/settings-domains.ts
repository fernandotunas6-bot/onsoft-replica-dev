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

const isoDate = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;

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
  /**
   * Onde a multa se aplica: `all` em todos os pagamentos; `electronic` só nos
   * electrónicos (Multicaixa, referência EMIS, Express, Unitel Money, AppyPay).
   * Regra em `features/finance/late-fee.ts` e `private.late_fee_due`.
   */
  late_fee_scope: "all" | "electronic";
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

/**
 * Regulamento académico do Ensino Superior. Cada instituição tem o seu: estes
 * valores por omissão são só o ponto de partida (prática comum em Angola e
 * Portugal, escala 0–20) e a escola edita-os em Definições.
 */
export type HigherEdRegulation = {
  /** Créditos máximos a que o estudante se pode inscrever por ano lectivo. */
  max_credits_per_year: number;
  /** Créditos máximos por semestre. */
  max_credits_per_semester: number;
  /** Peso da frequência na nota final (o exame tem 1 − peso). */
  frequency_weight: number;
  /** Abaixo desta média de frequência o estudante fica excluído (não vai a exame). */
  exam_admission_min: number;
  /** A partir desta média de frequência fica dispensado de exame. 0 = sem dispensa. */
  exam_exemption_min: number;
  /** Nota mínima de aprovação. */
  passing_grade: number;
  /** Faltas acima desta percentagem excluem por faltas. 0 = sem limite. */
  max_absence_percent: number;
  /** Época especial: só para quem tem até este número de cadeiras em falta para concluir. */
  special_season_max_units: number;
  /** Tentativas máximas por cadeira. 0 = sem limite. */
  max_attempts: number;
  /** Época de melhoria disponível (nunca baixa a nota). */
  improvement_enabled: boolean;
  /**
   * Situação académica: abaixo desta percentagem dos créditos esperados para os
   * anos já frequentados o estudante fica «em atraso». 0 = não avalia.
   */
  standing_delay_percent: number;
  /** Abaixo desta percentagem fica «em risco». 0 = não avalia. */
  standing_risk_percent: number;
  /**
   * Prescrição: anos além da duração do curso a partir dos quais o estudante
   * excede o prazo máximo. 0 = sem prescrição.
   */
  max_extra_years: number;
  /** Nota mínima no exame de acesso para entrar na seriação. 0 = sem mínimo. */
  access_min_score: number;
  /** Como os «holds» do Banner: propinas vencidas impedem a inscrição em cadeiras. */
  block_enrollment_with_debt: boolean;
  /**
   * Como o trancamento do SIGAA: dias após o início do semestre até quando a
   * secretaria anula uma inscrição sem 2FA. Depois disso exige 2FA. 0 = sem prazo.
   */
  cancel_deadline_days: number;
  /** Período de inscrições em cadeiras (AAAA-MM-DD). Vazio = sempre aberto. */
  enrollment_opens_on: string | null;
  enrollment_closes_on: string | null;
  /**
   * Como a matrícula on-line do SIGAA: o estudante inscreve-se nas cadeiras no
   * portal, com as mesmas regras da secretaria (período, dívida, precedências,
   * créditos). Desligado: só a secretaria inscreve.
   */
  student_self_enrollment: boolean;
  /**
   * Estatuto de trabalhador-estudante (atribuído pela secretaria, por ano lectivo, com
   * comprovativo): as faltas não excluem da avaliação (como no SIGARRA).
   */
  worker_student_absence_exempt: boolean;
  /** Trabalhador-estudante vai à época especial mesmo sem ser finalista. */
  worker_student_special_season: boolean;
};

export const HIGHER_ED_DEFAULTS: HigherEdRegulation = {
  max_credits_per_year: 60,
  max_credits_per_semester: 36,
  frequency_weight: 0.4,
  exam_admission_min: 7,
  exam_exemption_min: 14,
  passing_grade: 10,
  max_absence_percent: 25,
  special_season_max_units: 2,
  max_attempts: 0,
  improvement_enabled: true,
  standing_delay_percent: 75,
  standing_risk_percent: 50,
  max_extra_years: 0,
  access_min_score: 10,
  block_enrollment_with_debt: false,
  cancel_deadline_days: 0,
  enrollment_opens_on: null,
  enrollment_closes_on: null,
  student_self_enrollment: false,
  worker_student_absence_exempt: true,
  worker_student_special_season: true,
};

export type HigherEdDegree = "licenciatura" | "mestrado" | "doutoramento" | "especializacao";
export type HigherEdModality = "presencial" | "semipresencial" | "distancia";
export type HigherEdRegime = "regular" | "pos_laboral";

/** Perfil de um curso do Ensino Superior (grau, modalidade, regime e vagas). */
export type HigherEdProgramProfile = {
  degree: HigherEdDegree;
  modality: HigherEdModality;
  regime: HigherEdRegime;
  /** Vagas anuais para novos estudantes (Decreto Presidencial 5/19). 0 = não definido. */
  seats: number;
};

export const HIGHER_ED_PROGRAM_DEFAULT: HigherEdProgramProfile = {
  degree: "licenciatura",
  modality: "presencial",
  regime: "regular",
  seats: 0,
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

export function parseProgramProfile(value: unknown): HigherEdProgramProfile {
  const v = asRecord(value);
  const d = HIGHER_ED_PROGRAM_DEFAULT;
  return {
    degree: oneOf(
      v["degree"],
      ["licenciatura", "mestrado", "doutoramento", "especializacao"],
      d.degree,
    ),
    modality: oneOf(v["modality"], ["presencial", "semipresencial", "distancia"], d.modality),
    regime: oneOf(v["regime"], ["regular", "pos_laboral"], d.regime),
    seats: bounded(v["seats"], d.seats, 0, 100_000, true),
  };
}

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
        late_fee_scope: v["late_fee_scope"] === "electronic" ? "electronic" : "all",
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
  higher_ed: {
    label: "Ensino Superior",
    parse: (value: unknown): HigherEdRegulation => {
      const v = asRecord(value);
      const d = HIGHER_ED_DEFAULTS;
      const admission = bounded(v["exam_admission_min"], d.exam_admission_min, 0, 20);
      const exemption = bounded(v["exam_exemption_min"], d.exam_exemption_min, 0, 20);
      const perYear = bounded(v["max_credits_per_year"], d.max_credits_per_year, 1, 120, true);
      return {
        max_credits_per_year: perYear,
        max_credits_per_semester: Math.min(
          bounded(v["max_credits_per_semester"], d.max_credits_per_semester, 1, 120, true),
          perYear,
        ),
        frequency_weight: bounded(v["frequency_weight"], d.frequency_weight, 0, 1),
        exam_admission_min: admission,
        // Dispensa abaixo da admissão não faz sentido: 0 desliga a dispensa.
        exam_exemption_min: exemption > 0 && exemption < admission ? admission : exemption,
        passing_grade: bounded(v["passing_grade"], d.passing_grade, 0, 20),
        max_absence_percent: bounded(v["max_absence_percent"], d.max_absence_percent, 0, 100),
        special_season_max_units: bounded(
          v["special_season_max_units"],
          d.special_season_max_units,
          0,
          20,
          true,
        ),
        max_attempts: bounded(v["max_attempts"], d.max_attempts, 0, 20, true),
        improvement_enabled:
          typeof v["improvement_enabled"] === "boolean"
            ? v["improvement_enabled"]
            : d.improvement_enabled,
        standing_delay_percent: bounded(
          v["standing_delay_percent"],
          d.standing_delay_percent,
          0,
          100,
          true,
        ),
        standing_risk_percent: Math.min(
          bounded(v["standing_risk_percent"], d.standing_risk_percent, 0, 100, true),
          bounded(v["standing_delay_percent"], d.standing_delay_percent, 0, 100, true) || 100,
        ),
        max_extra_years: bounded(v["max_extra_years"], d.max_extra_years, 0, 10, true),
        access_min_score: bounded(v["access_min_score"], d.access_min_score, 0, 20),
        block_enrollment_with_debt:
          typeof v["block_enrollment_with_debt"] === "boolean"
            ? v["block_enrollment_with_debt"]
            : d.block_enrollment_with_debt,
        cancel_deadline_days: bounded(
          v["cancel_deadline_days"],
          d.cancel_deadline_days,
          0,
          365,
          true,
        ),
        enrollment_opens_on: isoDate(v["enrollment_opens_on"]),
        enrollment_closes_on: isoDate(v["enrollment_closes_on"]),
        student_self_enrollment:
          typeof v["student_self_enrollment"] === "boolean"
            ? v["student_self_enrollment"]
            : d.student_self_enrollment,
        worker_student_absence_exempt:
          typeof v["worker_student_absence_exempt"] === "boolean"
            ? v["worker_student_absence_exempt"]
            : d.worker_student_absence_exempt,
        worker_student_special_season:
          typeof v["worker_student_special_season"] === "boolean"
            ? v["worker_student_special_season"]
            : d.worker_student_special_season,
      };
    },
  },
  higher_ed_programs: {
    label: "Cursos do Ensino Superior",
    /** { [programId]: perfil } — só ids com forma de uuid. */
    parse: (value: unknown): Record<string, HigherEdProgramProfile> =>
      Object.fromEntries(
        Object.entries(asRecord(value))
          .filter(([id]) => /^[0-9a-f-]{36}$/i.test(id))
          .map(([id, profile]) => [id, parseProgramProfile(profile)]),
      ),
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

type SettingsRow = { id: string; version: number; value: unknown };

async function readSettingsRow(db: SupabaseClient, schoolId: string, domain: string) {
  const { data, error } = await db
    .from("school_settings")
    .select("id, version, value")
    .eq("school_id", schoolId)
    .eq("domain", domain)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler as definições (${domain}).`);
  return (data as SettingsRow | null) ?? null;
}

/**
 * Lê–altera–grava um domínio sem perder edições alheias: grava só sobre a
 * versão lida e, se outra pessoa gravou entretanto, volta a ler e aplica a
 * alteração de novo (até 3 vezes). `change` recebe o valor actual (ou null).
 */
export async function updateSettingsDomainValue<T>(
  db: SupabaseClient,
  schoolId: string,
  domain: string,
  change: (current: unknown) => T,
  userId: string,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readSettingsRow(db, schoolId, domain);
    const next = change(row?.value ?? null);
    if (row) {
      const { data, error } = await db
        .from("school_settings")
        .update({ value: next, version: Number(row.version ?? 1) + 1, changed_by: userId })
        .eq("id", row.id)
        .eq("school_id", schoolId)
        .eq("version", row.version)
        .select("id");
      if (error) throw new Error(`Não foi possível guardar as definições (${domain}).`);
      if (data?.length) return next;
      continue; // outra gravação passou à frente: reler e reaplicar
    }
    const { error } = await db
      .from("school_settings")
      .insert({ school_id: schoolId, domain, version: 1, value: next, changed_by: userId });
    if (!error) return next;
    // Corrida na primeira gravação (linha criada entretanto): tentar como update.
    if (!/duplicate|unique|23505/i.test(error.message)) {
      throw new Error(`Não foi possível criar as definições (${domain}).`);
    }
  }
  throw new Error("As definições mudaram várias vezes entretanto. Tente de novo.");
}
