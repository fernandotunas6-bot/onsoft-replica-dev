import { normalizeNumber, normalizeText, valueOf } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { uniqueExactMatch } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type GradeRef = Ref & { program_id: string | null };
type ClassesCache = ImportRefCache & {
  existingGrades: GradeRef[];
  programs: Ref[];
};

/**
 * Em produção uma classe pertence a um curso: a chave natural de `grade_levels` é
 * `(school_id, program_id, code)`, e é assim que a função de instalação da escola a
 * cria. A folha traz isso na coluna "Curso / Especialidade"; quando a escola só tem um
 * curso, não vale a pena exigi-la.
 */
function resolvePrograma(
  normalized: Record<string, unknown>,
  programs: Ref[],
): { program: Ref | null; ambiguous: boolean; indicado: boolean } {
  const hint = valueOf(normalized, "course_code", "curso", "especialidade", "program");
  if (hint) {
    const match = uniqueExactMatch(hint, programs, [(p) => p.code, (p) => p.name]);
    return { program: match.row, ambiguous: match.ambiguous, indicado: true };
  }
  if (programs.length === 1) return { program: programs[0]!, ambiguous: false, indicado: false };
  return { program: null, ambiguous: false, indicado: false };
}

export const classesImporter: RowImporter = {
  module: "classes",

  async loadRefCache(ctx) {
    const [gradesResult, programsResult] = await Promise.all([
      ctx.db
        .from("grade_levels")
        .select("id, code, name, program_id")
        .eq("school_id", ctx.schoolId),
      ctx.db.from("programs").select("id, code, name").eq("school_id", ctx.schoolId),
    ]);
    if (gradesResult.error) {
      throw new Error(`Não foi possível carregar classes: ${gradesResult.error.message}`);
    }
    if (programsResult.error) {
      throw new Error(`Não foi possível carregar cursos: ${programsResult.error.message}`);
    }
    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      existingGrades: (gradesResult.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
        program_id: r.program_id ? String(r.program_id) : null,
      })),
      programs: (programsResult.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
    } as ClassesCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as ClassesCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = normalizeText(valueOf(normalized, "code", "codigo", "classe"));
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"));

    if (!code) errors.push("Código da classe é obrigatório.");
    if (!name) errors.push("Nome da classe é obrigatório.");

    if (errors.length) return { status: "error", warnings, errors };

    const { program, ambiguous, indicado } = resolvePrograma(normalized, cache.programs);
    if (ambiguous) {
      errors.push(`O curso indicado é ambíguo entre vários cursos desta escola.`);
    } else if (!program) {
      errors.push(
        cache.programs.length === 0
          ? "Nenhum curso está cadastrado nesta escola. Importe primeiro os cursos — uma classe pertence sempre a um curso."
          : indicado
            ? `Curso indicado não existe nesta escola. Use um destes: ${cache.programs
                .map((p) => p.code || p.name)
                .join(", ")}.`
            : `Preencha a coluna "Curso / Especialidade": esta escola tem mais do que um curso.`,
      );
    }

    if (errors.length) return { status: "error", warnings, errors };

    // A duplicação é por curso: a mesma "10ª Classe" pode existir em cursos diferentes.
    const doPrograma = cache.existingGrades.filter((r) => r.program_id === program!.id);
    const existing = uniqueExactMatch(code || name, doPrograma, [(r) => r.code, (r) => r.name]);
    if (existing.row) {
      return {
        status: "duplicate",
        warnings: ["Classe já cadastrada neste curso."],
        errors: [],
        duplicate_of: existing.row.id,
      };
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as ClassesCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const code = normalizeText(valueOf(normalized, "code", "codigo", "classe"))!;
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"))!;
    const sequence = normalizeNumber(valueOf(normalized, "order_index", "ordem", "sequencia")) || 1;

    if (analysis.status === "duplicate") {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: analysis.duplicate_of,
      };
    }

    const { program } = resolvePrograma(normalized, cache.programs);

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: null,
      };
    }

    const { data, error } = await ctx.db
      .from("grade_levels")
      .insert({
        school_id: ctx.schoolId,
        program_id: program!.id,
        code,
        name,
        sequence,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar classe: ${error.message}`],
        audits: [],
      };
    }

    cache.existingGrades.push({
      id: String(data.id),
      code,
      name,
      program_id: program!.id,
    });
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [
        {
          table_name: "grade_levels",
          target_id: String(data.id),
          action_type: "inserted",
          after_data: {
            school_id: ctx.schoolId,
            program_id: program!.id,
            code,
            name,
            sequence,
            is_active: true,
          },
        },
      ],
      target_record_id: String(data.id),
    };
  },
};
