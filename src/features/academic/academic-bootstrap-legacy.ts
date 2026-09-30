import type { TablesInsert } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { ensureDefaultTeacher } from "@/features/academic/sga-grades";

export type BootstrapAcademicOptions = {
  /** Propaga erros em vez de ignorar (ex.: botão em Pedagógica). */
  strict?: boolean;
};

export const DEFAULT_ACADEMIC_SUBJECTS = [
  { code: "MAT", name: "Matemática", short_name: "Mat" },
  { code: "PORT", name: "Língua Portuguesa", short_name: "Port" },
  { code: "CN", name: "Ciências Naturais", short_name: "CN" },
  { code: "HIST", name: "História", short_name: "Hist" },
  { code: "ING", name: "Inglês", short_name: "Ing" },
] as const;

export function defaultAcademicYearLabel(referenceDate = new Date()): string {
  const year = referenceDate.getFullYear();
  return `${year}/${year + 1}`;
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /schema cache|does not exist|relation .* does not exist/i.test(error.message ?? "")),
  );
}

function handleBootstrapError(
  error: { code?: string; message?: string } | null,
  context: string,
  strict?: boolean,
) {
  if (!error) return;
  if (isMissingTable(error)) {
    if (strict) throw new Error(`${context}: aplique o SQL SGA em falta.`);
    return;
  }
  if (strict) throw publicDatabaseError(error, context);
  console.warn(`[academic-bootstrap] ${context}:`, error.message);
}

/**
 * Cria ano lectivo activo se a escola ainda não tiver nenhum.
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
  const { data: existing } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", input.schoolId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { seeded: [] };

  const year = new Date().getFullYear();
  const { error } = await db.from("academic_years").insert({
    school_id: input.schoolId,
    name: input.yearName ?? defaultAcademicYearLabel(),
    starts_on: input.startsOn ?? `${year}-09-01`,
    ends_on: input.endsOn ?? `${year + 1}-07-31`,
    status: "active",
  });
  if (error) {
    handleBootstrapError(error, "Não foi possível criar o ano lectivo.", options?.strict);
    return { seeded: [] };
  }
  return { seeded: ["ano lectivo"] };
}

/**
 * Estrutura académica mínima para escola nova: nível, programa, campus,
 * disciplinas, trimestres e uma turma inicial. Falhas parciais são ignoradas
 * unless `strict`.
 */
export async function bootstrapAcademicStructure(
  db: SupabaseClient,
  input: { schoolId: string; userId: string | null },
  options?: BootstrapAcademicOptions,
): Promise<{ seeded: string[] }> {
  const strict = options?.strict;
  const seeded: string[] = [];
  const schoolId = input.schoolId;
  const auditUser = input.userId;

  let yearId: string | null = null;
  const { data: yearRow } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  yearId = (yearRow?.id as string | undefined) ?? null;

  let levelId: string | null = null;
  const { data: existingLevel } = await db
    .from("academic_levels")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  if (existingLevel?.id) {
    levelId = existingLevel.id as string;
  } else {
    const { data: createdLevel, error } = await db
      .from("academic_levels")
      .insert({
        school_id: schoolId,
        code: "GERAL",
        name: "Ensino Geral",
        // `sequence` é NOT NULL sem default: sem ele o insert falhava com
        // 23502 e «Preparar estrutura académica» não criava nada.
        sequence: 1,
        is_active: true,
      })
      .select("id")
      .single();
    if (!error && createdLevel?.id) {
      levelId = createdLevel.id as string;
      seeded.push("nível académico");
    } else {
      handleBootstrapError(error, "Não foi possível criar o nível académico.", strict);
    }
  }

  let programId: string | null = null;
  const { data: existingProgram } = await db
    .from("programs")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  if (existingProgram?.id) {
    programId = existingProgram.id as string;
  } else if (levelId) {
    const { data: createdProgram, error } = await db
      .from("programs")
      .insert({
        school_id: schoolId,
        academic_level_id: levelId,
        code: "GERAL",
        name: "Ensino Geral",
        kind: "general",
        is_active: true,
      })
      .select("id")
      .single();
    if (!error && createdProgram?.id) {
      programId = createdProgram.id as string;
      seeded.push("programa");
    } else {
      handleBootstrapError(error, "Não foi possível criar o programa.", strict);
    }
  } else if (strict) {
    throw new Error("Crie primeiro um nível académico na escola SGA.");
  }

  const { data: existingCampus } = await db
    .from("campuses")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  let campusId = (existingCampus?.id as string | undefined) ?? null;
  if (!campusId) {
    const { data: campus, error } = await db
      .from("campuses")
      .insert({
        school_id: schoolId,
        code: "SEDE",
        name: "Campus Principal",
        is_active: true,
      })
      .select("id")
      .single();
    if (!error && campus?.id) {
      campusId = campus.id as string;
      seeded.push("campus");
    } else {
      handleBootstrapError(error, "Não foi possível criar o campus.", strict);
    }
  }

  const { data: existingSubjects } = await db
    .from("subjects")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1);
  // `subjects.created_by`/`updated_by` são NOT NULL: sem utilizador a base recusava.
  if ((existingSubjects ?? []).length === 0 && auditUser) {
    const subjectRows = DEFAULT_ACADEMIC_SUBJECTS.map((subject) => ({
      school_id: schoolId,
      code: subject.code,
      name: subject.name,
      short_name: subject.short_name,
      status: "active",
      created_by: auditUser,
      updated_by: auditUser,
    }));
    const { error } = await db.from("subjects").insert(subjectRows);
    if (!error) seeded.push("disciplinas");
    else handleBootstrapError(error, "Não foi possível criar disciplinas iniciais.", strict);
  }

  if (yearId) {
    const { data: termRows } = await db
      .from("terms")
      .select("id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .limit(1);
    if ((termRows ?? []).length === 0) {
      const { error } = await db.from("terms").insert([
        {
          school_id: schoolId,
          academic_year_id: yearId,
          name: "1º Trimestre",
          sequence: 1,
          starts_on: "2026-09-01",
          ends_on: "2026-12-15",
        },
        {
          school_id: schoolId,
          academic_year_id: yearId,
          name: "2º Trimestre",
          sequence: 2,
          starts_on: "2027-01-05",
          ends_on: "2027-03-20",
        },
        {
          school_id: schoolId,
          academic_year_id: yearId,
          name: "3º Trimestre",
          sequence: 3,
          starts_on: "2027-04-01",
          ends_on: "2027-07-15",
        },
      ]);
      if (!error) seeded.push("trimestres");
      else handleBootstrapError(error, "Não foi possível criar trimestres.", strict);
    }
  }

  let gradeLevelId: string | null = null;
  const { data: existingGrade } = await db
    .from("grade_levels")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  if (existingGrade?.id) {
    gradeLevelId = existingGrade.id as string;
  } else if (programId) {
    const { data: grade, error } = await db
      .from("grade_levels")
      .insert({
        school_id: schoolId,
        program_id: programId,
        code: "10A",
        name: "10ª Classe",
        sequence: 10,
        is_active: true,
      })
      .select("id")
      .single();
    if (!error && grade?.id) {
      gradeLevelId = grade.id as string;
      seeded.push("classe");
    } else {
      handleBootstrapError(error, "Não foi possível criar a classe.", strict);
    }
  }

  // `class_groups.campus_id` é NOT NULL: sem campus não há turma de exemplo.
  const groupCampusId = campusId;
  // `created_by`/`updated_by` também são NOT NULL: sem utilizador não há turma.
  if (yearId && gradeLevelId && groupCampusId && auditUser) {
    const { data: existingGroup } = await db
      .from("class_groups")
      .select("id")
      .eq("school_id", schoolId)
      .limit(1)
      .maybeSingle();
    if (!existingGroup?.id) {
      const groupPayload: TablesInsert<"class_groups"> = {
        school_id: schoolId,
        academic_year_id: yearId,
        grade_level_id: gradeLevelId,
        campus_id: groupCampusId,
        code: "10A-M",
        name: "10ª A — Manhã",
        shift: "morning",
        capacity: 35,
        status: "active",
        created_by: auditUser,
        updated_by: auditUser,
      };
      // A antiga segunda tentativa "sem WhatsApp" tirava o `campus_id` (NOT NULL) e
      // falhava sempre; o payload nem tem colunas de WhatsApp.
      const { error } = await db.from("class_groups").insert(groupPayload);
      if (!error) seeded.push("turma inicial");
      else handleBootstrapError(error, "Não foi possível criar a turma inicial.", strict);
    }
  }

  return { seeded };
}

/**
 * Prepara estrutura académica completa (ano + árvore + professor por omissão).
 * Usado por Pedagógica e partilhado com o bootstrap de provisionamento.
 */
export async function ensureAcademicDefaultsCore(
  db: SupabaseClient,
  input: { schoolId: string; userId: string; yearName?: string },
  options: BootstrapAcademicOptions = { strict: true },
): Promise<{ created: string[] }> {
  const created: string[] = [];

  const year = await bootstrapAcademicYearIfMissing(
    db,
    {
      schoolId: input.schoolId,
      yearName: input.yearName ?? "2026/2027",
      startsOn: "2026-09-01",
      endsOn: "2027-07-31",
    },
    options,
  );
  created.push(...year.seeded);

  const academic = await bootstrapAcademicStructure(
    db,
    { schoolId: input.schoolId, userId: input.userId },
    options,
  );
  created.push(...academic.seeded);

  const { data: teachers } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", input.schoolId)
    .limit(1);
  if ((teachers ?? []).length === 0) {
    await ensureDefaultTeacher(db, input.schoolId, input.userId);
    created.push("professor");
  }

  return { created };
}
