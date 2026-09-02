import { upsertSgaTermGrade } from "@/features/academic/sga-grades";
import type { ImportModule } from "../schemas";
import type { RowImporter } from "../engine/types";
import {
  findStudentByIdentifier,
  findSubject,
  loadAcademicImportCache,
  parseScore,
  parseTerm,
  studentIdentifierOf,
  subjectNameOf,
} from "./academic-import-core";

function gradeValues(normalized: Record<string, unknown>) {
  const identifier = studentIdentifierOf(normalized);
  const subjectName = subjectNameOf(normalized);
  const term = parseTerm(normalized["term"] ?? normalized["periodo"] ?? normalized["Período"]);
  const mac = parseScore(normalized["mac"] ?? normalized["MAC (Avaliação Contínua)"]);
  const npp = parseScore(normalized["npp"] ?? normalized["NPP (Prova Professor)"]);
  const npt = parseScore(normalized["npt"] ?? normalized["NPT (Prova Trimestral)"]);
  return { identifier, subjectName, term, mac, npp, npt };
}

function createGradeImporter(module: Extract<ImportModule, "notas" | "pautas">): RowImporter {
  return {
    module,

    async loadRefCache(ctx) {
      return loadAcademicImportCache(ctx.db, ctx.schoolId, ctx.academicYearId);
    },

    analyzeRow(normalized, cache) {
      const values = gradeValues(normalized);
      const errors: string[] = [];
      if (!values.identifier) errors.push("Aluno (Processo ou BI) é obrigatório.");
      if (!values.subjectName) errors.push("Disciplina é obrigatória.");
      if (!values.term) errors.push("Período inválido; use 1º, 2º ou 3º trimestre.");
      if (values.mac === null) errors.push("MAC é obrigatória e deve estar entre 0 e 20.");
      if (values.npp === null) errors.push("NPP é obrigatória e deve estar entre 0 e 20.");
      if (values.npt === null) errors.push("NPT é obrigatória e deve estar entre 0 e 20.");

      const student = values.identifier ? findStudentByIdentifier(values.identifier, cache) : null;
      const subject = values.subjectName ? findSubject(values.subjectName, cache) : null;
      if (values.identifier && !student) errors.push(`Aluno "${values.identifier}" não encontrado.`);
      if (values.subjectName && !subject) errors.push(`Disciplina "${values.subjectName}" não encontrada.`);

      const enrollment = student
        ? cache.enrollments?.find((row) => row.student_id === student.id && row.status !== "cancelled")
        : null;
      if (student && !enrollment) {
        errors.push("O aluno não possui matrícula activa no ano lectivo seleccionado.");
      }

      return errors.length
        ? { status: "error", warnings: [], errors }
        : {
            status: "valid",
            warnings: [
              module === "pautas"
                ? "A linha será lançada na pauta através do diário académico oficial."
                : "A linha será lançada no diário académico oficial.",
            ],
            errors: [],
          };
    },

    async commitRow(normalized, ctx, cache) {
      const values = gradeValues(normalized);
      const student = findStudentByIdentifier(values.identifier, cache);
      const subject = findSubject(values.subjectName, cache);
      const enrollment = student
        ? cache.enrollments?.find((row) => row.student_id === student.id && row.status !== "cancelled")
        : null;

      if (
        !student ||
        !subject ||
        !enrollment ||
        !values.term ||
        values.mac === null ||
        values.npp === null ||
        values.npt === null
      ) {
        return {
          status: "error",
          warnings: [],
          errors: ["Linha de nota inválida ou referências académicas não encontradas."],
          audits: [],
        };
      }

      if (ctx.dryRun) {
        return {
          status: "will_update",
          target_record_id: enrollment.id,
          warnings: ["MAC/NPP/NPT seriam gravadas no diário oficial; nenhuma alteração foi feita."],
          errors: [],
          audits: [],
        };
      }

      try {
        const result = await upsertSgaTermGrade({
          db: ctx.db,
          schoolId: ctx.schoolId,
          userId: ctx.userId,
          enrollmentId: enrollment.id,
          subjectId: subject.id,
          term: values.term,
          mac: values.mac,
          npp: values.npp,
          npt: values.npt,
        });
        return {
          status: "imported",
          target_record_id: enrollment.id,
          warnings: [],
          errors: [],
          audits: [
            {
              table_name: "grade_scores",
              target_id: enrollment.id,
              action_type: "updated",
              after_data: {
                enrollment_id: result.enrollment_id,
                subject_id: result.subject_id,
                term: result.term,
                mac: result.mac,
                npp: result.npp,
                npt: result.npt,
                average: result.average,
              },
            },
          ],
        };
      } catch (error) {
        return {
          status: "error",
          warnings: [],
          errors: [error instanceof Error ? error.message : "Não foi possível lançar a nota."],
          audits: [],
        };
      }
    },
  };
}

export const notasImporter = createGradeImporter("notas");
export const pautasImporter = createGradeImporter("pautas");
