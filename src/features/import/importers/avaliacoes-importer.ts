import { normalizeDate, normalizeNumber, normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import {
  loadClassSubjectRefs,
  loadSubjectRefs,
  parseTerm,
  resolveSubject,
  uniqueExactMatch,
  type ClassSubjectRef,
  type SubjectRef,
} from "./academic-core";

type Ref = { id: string; code: string; name: string };
type GradebookRecord = { id: string; class_subject_id: string; term_id: string };
type TermRecord = { id: string; sequence: number };
type AvaliacoesCache = ImportRefCache & {
  subjects: SubjectRef[];
  classGroupRefs: Ref[];
  classSubjects: ClassSubjectRef[];
  terms: TermRecord[];
  gradebooks: GradebookRecord[];
  existingItemCodes: Set<string>;
};

/**
 * `grade_items.kind` só aceita esta lista, e a coluna é NOT NULL — o importador não a
 * preenchia de todo, por isso cada avaliação era recusada com 23502 antes sequer de
 * chegar ao CHECK. Os rótulos da folha ("Prova Escrita", "Trabalho Prático"…) mapeiam
 * para cá.
 */
function resolveKind(value: unknown): string {
  const texto = normalizeText(value).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!texto) return "test";
  if (texto.includes("trabalho") || texto.includes("projeto") || texto.includes("projecto")) {
    return "assignment";
  }
  if (texto.includes("oral") || texto.includes("continua")) return "continuous";
  if (texto.includes("recurso") || texto.includes("resit")) return "resit";
  if (texto.includes("recupera")) return "recovery";
  if (texto.includes("exame")) return texto.includes("trimestr") ? "term_exam" : "exam";
  return "test";
}

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

/**
 * O diário a que a avaliação pertence, resolvido pela turma + disciplina + período da
 * linha. Antes o importador usava `gradebooks[0]` — o primeiro diário da escola,
 * qualquer que fosse: uma avaliação de Matemática da 10ªA podia aterrar no diário de
 * Física da 7ªB.
 */
function resolveGradebook(
  normalized: Record<string, unknown>,
  cache: AvaliacoesCache,
): { gradebook: GradebookRecord | null; motivo: string | null } {
  const groupVal = valueOf(normalized, "class_group", "turma", "codigo_turma");
  const subjectVal = valueOf(normalized, "subject", "disciplina", "materia");
  const termNum = parseTerm(valueOf(normalized, "term", "periodo", "trimestre"));

  if (!groupVal || !subjectVal || !termNum) {
    return {
      gradebook: null,
      motivo:
        "Turma, disciplina e período são obrigatórios para saber a que diário a avaliação pertence.",
    };
  }

  const group = uniqueExactMatch(groupVal, cache.classGroupRefs, [(r) => r.code, (r) => r.name]);
  if (!group.row) {
    return {
      gradebook: null,
      motivo: `Turma "${normalizeText(groupVal)}" não encontrada nesta escola.`,
    };
  }

  const subject = resolveSubject(subjectVal, cache.subjects);
  if (!subject.row) {
    return {
      gradebook: null,
      motivo: `Disciplina "${normalizeText(subjectVal)}" não encontrada nesta escola.`,
    };
  }

  const classSubject = cache.classSubjects.find(
    (row) => row.class_group_id === group.row!.id && row.subject_id === subject.row!.id,
  );
  if (!classSubject) {
    return { gradebook: null, motivo: "A disciplina não está atribuída a esta turma." };
  }

  const term = cache.terms.find((row) => row.sequence === termNum);
  if (!term) {
    return {
      gradebook: null,
      motivo: `O ${termNum}º período não está configurado neste ano lectivo.`,
    };
  }

  const gradebook = cache.gradebooks.find(
    (row) => row.class_subject_id === classSubject.id && row.term_id === term.id,
  );
  if (!gradebook) {
    return {
      gradebook: null,
      motivo:
        "O diário de notas desta turma/disciplina/período ainda não foi preparado. Abra o diário antes da importação.",
    };
  }

  return { gradebook, motivo: null };
}

export const avaliacoesImporter: RowImporter = {
  module: "avaliacoes",

  async loadRefCache(ctx) {
    const [subjects, classSubjects, groupsRes, termsRes, gradebooksRes, itemsRes] =
      await Promise.all([
        loadSubjectRefs(ctx.db, ctx.schoolId),
        loadClassSubjectRefs(ctx.db, ctx.schoolId),
        ctx.db.from("class_groups").select("id, code, name").eq("school_id", ctx.schoolId),
        ctx.academicYearId
          ? ctx.db
              .from("terms")
              .select("id, sequence")
              .eq("school_id", ctx.schoolId)
              .eq("academic_year_id", ctx.academicYearId)
          : ctx.db.from("terms").select("id, sequence").eq("school_id", ctx.schoolId),
        ctx.db
          .from("gradebooks")
          .select("id, class_subject_id, term_id")
          .eq("school_id", ctx.schoolId),
        ctx.db.from("grade_items").select("code").eq("school_id", ctx.schoolId),
      ]);

    const gradebooks = (gradebooksRes.data ?? []).map((g) => ({
      id: String(g.id),
      class_subject_id: String(g.class_subject_id),
      term_id: String(g.term_id),
    }));

    const existingItemCodes = new Set(
      (itemsRes.data ?? []).map((i) => String(i.code).toUpperCase()).filter(Boolean),
    );

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      subjects,
      classSubjects,
      classGroupRefs: (groupsRes.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
      terms: (termsRes.data ?? []).map((r) => ({ id: String(r.id), sequence: Number(r.sequence) })),
      gradebooks,
      existingItemCodes,
    } as AvaliacoesCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as AvaliacoesCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = normalizeText(
      valueOf(normalized, "assessment_name", "title", "avaliacao", "prova", "titulo", "designacao"),
    );
    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"))?.toUpperCase();
    const maxScore = normalizeNumber(
      valueOf(normalized, "max_score", "nota_maxima", "cotacao", "escala") ?? 20,
    );

    if (!name) errors.push("Designação ou nome da avaliação é obrigatório.");
    if (!code) errors.push("Código ou sigla da avaliação é obrigatório (ex: MAC, NPP, NPT, P1).");
    if (maxScore === null || maxScore <= 0 || maxScore > 20) {
      errors.push("Cotação máxima da avaliação deve estar entre 1 e 20 valores.");
    }

    // `grade_items_code_check`: ^[A-Z0-9_-]{2,30}$. Sem isto o erro só aparecia na gravação.
    if (code && !/^[A-Z0-9_-]{2,30}$/.test(code)) {
      errors.push(
        `Código "${code}" inválido: use 2 a 30 caracteres, apenas letras, números, "-" ou "_".`,
      );
    }

    if (errors.length) return { status: "error", warnings, errors };

    const { motivo } = resolveGradebook(normalized, cache);
    if (motivo) {
      errors.push(motivo);
      return { status: "error", warnings, errors };
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as AvaliacoesCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const name = normalizeText(
      valueOf(normalized, "assessment_name", "title", "avaliacao", "prova", "titulo", "designacao"),
    )!;
    const code = normalizeText(valueOf(normalized, "code", "codigo", "sigla"))!.toUpperCase();
    const maxScore =
      normalizeNumber(valueOf(normalized, "max_score", "nota_maxima", "cotacao", "escala")) ?? 20;
    const weight = normalizeNumber(valueOf(normalized, "weight", "peso", "ponderacao")) ?? 1;
    const kind = resolveKind(valueOf(normalized, "evaluation_type", "tipo", "tipo_avaliacao"));
    const assessedOn = normalizeDate(
      valueOf(normalized, "evaluation_date", "data", "data_aplicacao"),
    );

    const { gradebook, motivo } = resolveGradebook(normalized, cache);
    if (!gradebook) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [motivo ?? "Não foi possível determinar o diário desta avaliação."],
        audits: [],
      };
    }

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
      .from("grade_items")
      .insert({
        school_id: ctx.schoolId,
        gradebook_id: gradebook.id,
        name,
        code,
        kind,
        max_score: maxScore,
        weight: weight > 0 && weight <= 100 ? weight : 1,
        assessed_on: assessedOn,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao registar avaliação: ${error.message}`],
        audits: [],
      };
    }

    cache.existingItemCodes.add(code);
    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      target_record_id: String(data.id),
    };
  },
};
