import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadAcademicLevelRefs, uniqueExactMatch, type AcademicLevelRef } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type CursosCache = ImportRefCache & {
  existingCourses: Ref[];
  academicLevels: AcademicLevelRef[];
};

const KIND_OPTIONS = [
  "general",
  "technical",
  "professional",
  "undergraduate",
  "postgraduate",
] as const;

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

/** "Técnico Médio" → technical, "Ensino Secundário Geral" → general, etc. Sem correspondência, general. */
function resolveKind(value: unknown): (typeof KIND_OPTIONS)[number] {
  const text = normalizeText(value).toLowerCase();
  if (text.includes("tecnic") || text.includes("técnic")) return "technical";
  if (text.includes("profiss")) return "professional";
  if (text.includes("licenciatura") || text.includes("bacharelato") || text.includes("graduaç"))
    return "undergraduate";
  if (text.includes("mestrado") || text.includes("pós") || text.includes("pos-grad"))
    return "postgraduate";
  return "general";
}

/**
 * `programs.academic_level_id` é obrigatório. Três caminhos, por ordem de fiabilidade:
 *
 *   1. a coluna "Nível Académico" (`academic_level`), casada com um nível já configurado;
 *   2. "Habilitação / Grau" ou "Área de Formação", que muitas folhas antigas usam para o
 *      mesmo fim — best-effort, e só vale se der correspondência exacta;
 *   3. o único nível activo da escola, quando só há um: o caso comum de escolas de um ciclo,
 *      onde exigir a coluna seria burocracia sem informação.
 *
 * Sem nenhum dos três, a linha reprova — o nível não se inventa.
 */
function resolveAcademicLevel(
  normalized: Record<string, unknown>,
  levels: AcademicLevelRef[],
): { level: AcademicLevelRef | null; ambiguous: boolean } {
  const explicit = valueOf(normalized, "academic_level", "nivel", "nível", "nivel_academico");
  if (explicit) {
    const match = uniqueExactMatch(explicit, levels, [(l) => l.code, (l) => l.name]);
    if (match.row) return { level: match.row, ambiguous: false };
    if (match.ambiguous) return { level: null, ambiguous: true };
    // Indicado mas desconhecido: não cair para a heurística, que escolheria outro nível.
    return { level: null, ambiguous: false };
  }

  const hint = valueOf(normalized, "degree", "grau", "level", "area", "área");
  if (hint) {
    const match = uniqueExactMatch(hint, levels, [(l) => l.code, (l) => l.name]);
    if (match.row) return { level: match.row, ambiguous: false };
    if (match.ambiguous) return { level: null, ambiguous: true };
  }

  if (levels.length === 1) return { level: levels[0]!, ambiguous: false };
  return { level: null, ambiguous: false };
}

export const cursosImporter: RowImporter = {
  module: "cursos",

  async loadRefCache(ctx) {
    const [coursesResult, academicLevels] = await Promise.all([
      ctx.db.from("programs").select("id, code, name").eq("school_id", ctx.schoolId),
      loadAcademicLevelRefs(ctx.db, ctx.schoolId),
    ]);
    if (coursesResult.error) {
      throw new Error(`Não foi possível carregar cursos: ${coursesResult.error.message}`);
    }
    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      existingCourses: (coursesResult.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
      academicLevels,
    } as CursosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as CursosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"));
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"));

    if (!code) errors.push("Código ou sigla do curso é obrigatório.");
    if (!name) errors.push("Nome completo do curso é obrigatório.");

    if (errors.length) return { status: "error", warnings, errors };

    const existing = uniqueExactMatch(code || name, cache.existingCourses, [
      (r) => r.code,
      (r) => r.name,
    ]);
    if (existing.row) {
      return {
        status: "duplicate",
        warnings: ["Curso já cadastrado nesta instituição."],
        errors: [],
        duplicate_of: existing.row.id,
      };
    }

    const { level, ambiguous } = resolveAcademicLevel(normalized, cache.academicLevels);
    if (ambiguous) {
      errors.push(
        `O nível académico indicado é ambíguo entre vários níveis configurados nesta escola.`,
      );
    } else if (!level) {
      errors.push(
        cache.academicLevels.length === 0
          ? "Nenhum nível académico está configurado nesta escola. Configure em Académico → Níveis Académicos antes de importar cursos."
          : `Preencha a coluna "Nível Académico" com um dos níveis configurados nesta escola: ${cache.academicLevels
              .map((l) => l.name)
              .join(", ")}.`,
      );
    }

    if (errors.length) return { status: "error", warnings, errors };
    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as CursosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"))!;
    const name = normalizeText(valueOf(normalized, "name", "nome", "designacao"))!;

    if (analysis.status === "duplicate") {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: analysis.duplicate_of,
      };
    }

    const { level } = resolveAcademicLevel(normalized, cache.academicLevels);
    const kind = resolveKind(valueOf(normalized, "degree", "grau", "kind", "tipo"));

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
      .from("programs")
      .insert({
        school_id: ctx.schoolId,
        academic_level_id: level!.id,
        code,
        name,
        kind,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar curso: ${error.message}`],
        audits: [],
      };
    }

    cache.existingCourses.push({ id: String(data.id), code, name });
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: String(data.id),
    };
  },
};
