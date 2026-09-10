import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultTeacher } from "@/features/academic/sga-grades";
import * as legacy from "./academic-bootstrap-legacy";

export * from "./academic-bootstrap-legacy";

export type BootstrapAcademicOptions = legacy.BootstrapAcademicOptions;

type CalendarState = {
  academicYearId: string;
  academicYearName: string;
};

async function requireConfiguredAcademicCalendar(
  db: SupabaseClient,
  schoolId: string,
  options?: BootstrapAcademicOptions,
): Promise<CalendarState | null> {
  const { data: year, error: yearError } = await db
    .from("academic_years")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (yearError) {
    if (options?.strict) {
      throw new Error(`Não foi possível validar o ano lectivo configurado: ${yearError.message}`);
    }
    return null;
  }
  if (!year?.id) {
    if (options?.strict) {
      throw new Error(
        "Configure primeiro o ano lectivo real da escola antes de preparar a estrutura académica.",
      );
    }
    return null;
  }

  const { data: terms, error: termsError } = await db
    .from("terms")
    .select("id, sequence, starts_on, ends_on")
    .eq("school_id", schoolId)
    .eq("academic_year_id", year.id)
    .order("sequence");

  if (termsError) {
    if (options?.strict) {
      throw new Error(`Não foi possível validar os períodos académicos: ${termsError.message}`);
    }
    return null;
  }

  const bySequence = new Map((terms ?? []).map((term) => [Number(term.sequence), term] as const));
  for (const sequence of [1, 2, 3]) {
    const term = bySequence.get(sequence);
    if (!term?.starts_on || !term?.ends_on) {
      if (options?.strict) {
        throw new Error(
          `Configure as datas reais do ${sequence}º trimestre antes de preparar a estrutura académica.`,
        );
      }
      return null;
    }
  }

  return {
    academicYearId: String(year.id),
    academicYearName: String(year.name ?? ""),
  };
}

/**
 * Compatibilidade segura: um ano lectivo só pode ser criado automaticamente
 * quando nome e datas foram fornecidos explicitamente pelo fluxo chamador.
 * Nunca deriva datas fictícias do relógio nem fixa 2026/2027.
 */
export async function bootstrapAcademicYearIfMissing(
  db: SupabaseClient,
  input: {
    schoolId: string;
    yearName?: string;
    startsOn?: string;
    endsOn?: string;
  },
  options?: BootstrapAcademicOptions,
): Promise<{ seeded: string[] }> {
  const { data: existing, error } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    if (options?.strict) {
      throw new Error(`Não foi possível validar o ano lectivo: ${error.message}`);
    }
    return { seeded: [] };
  }
  if (existing?.id) return { seeded: [] };

  if (!input.yearName?.trim() || !input.startsOn || !input.endsOn) {
    if (options?.strict) {
      throw new Error(
        "Ano lectivo não configurado. Informe nome, data de início e data de fim no calendário escolar.",
      );
    }
    return { seeded: [] };
  }

  return legacy.bootstrapAcademicYearIfMissing(
    db,
    {
      schoolId: input.schoolId,
      yearName: input.yearName.trim(),
      startsOn: input.startsOn,
      endsOn: input.endsOn,
    },
    options,
  );
}

/**
 * Só prepara a estrutura complementar depois de existir calendário real.
 * O legado é chamado apenas quando já existem os três trimestres; por isso o
 * ramo antigo que criava datas 2026/2027 nunca é alcançado através desta API.
 */
export async function bootstrapAcademicStructure(
  db: SupabaseClient,
  input: { schoolId: string; userId: string | null },
  options?: BootstrapAcademicOptions,
): Promise<{ seeded: string[] }> {
  const calendar = await requireConfiguredAcademicCalendar(db, input.schoolId, options);
  if (!calendar) return { seeded: [] };
  return legacy.bootstrapAcademicStructure(db, input, options);
}

/**
 * Botão "Preparar estrutura": não cria ano/períodos fictícios. A escola deve
 * configurar o calendário primeiro; depois são preparados apenas os elementos
 * estruturais que faltam.
 */
export async function ensureAcademicDefaultsCore(
  db: SupabaseClient,
  input: { schoolId: string; userId: string; yearName?: string },
  options: BootstrapAcademicOptions = { strict: true },
): Promise<{ created: string[] }> {
  await requireConfiguredAcademicCalendar(db, input.schoolId, options);

  const academic = await bootstrapAcademicStructure(
    db,
    { schoolId: input.schoolId, userId: input.userId },
    options,
  );
  const created = [...academic.seeded];

  const { data: teachers, error: teachersError } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("status", "active")
    .limit(1);
  if (teachersError && options.strict) {
    throw new Error(`Não foi possível validar os professores: ${teachersError.message}`);
  }

  if ((teachers ?? []).length === 0) {
    await ensureDefaultTeacher(db, input.schoolId, input.userId);
    created.push("professor");
  }

  return { created };
}
