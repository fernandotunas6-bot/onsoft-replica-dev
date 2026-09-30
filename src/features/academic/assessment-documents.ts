import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import {
  overlayActa,
  overlayBoletim,
  overlayMapa,
  overlayPauta,
  overlayServico,
  overlayValidacao,
} from "@/features/documents/print-overlays";
import type { PautaExportRow } from "@/features/academic/OfficialPautaView";
import type {
  ClassMapExportRow,
  StudentListExportRow,
} from "@/features/academic/assessment-center-config";
import type {
  buildClassCourseMap,
  buildStudentDossier,
} from "@/features/academic/assessment-views";
import { exportCsv } from "@/lib/export-csv";
import type { OfficialPautaMeta } from "@/lib/export-pdf";
import { exportOfficialPautaPdf } from "@/lib/export-pdf-loader";
import { formatScore } from "@/lib/angola-academic";

/**
 * Documentos do Centro de Avaliação (pauta, boletim, relação, mapa, acta,
 * validação) em PDF oficial ou Excel. Sem React: recebe o contexto já
 * calculado pelo ecrã, por isso pode ser testado sozinho.
 */

export type AssessmentDocKind = "pdf" | "excel";
export type AssessmentDocType = "pauta" | "boletim" | "mapa" | "relacao" | "acta" | "validacao";

export type AssessmentDocumentContext = {
  contextKind: "curso" | "turma" | "aluno" | "disciplina";
  group: { name?: string; grade_name?: string } | null | undefined;
  subjectName: string | undefined;
  school: Parameters<typeof issuePrintDocument>[0]["school"];
  meta: OfficialPautaMeta;
  rows: PautaExportRow[];
  classMap: ReturnType<typeof buildClassCourseMap>;
  dossier: ReturnType<typeof buildStudentDossier>;
  student: {
    student: { student_name: string; registration_number?: string | null };
    situacao: { label: string };
    average: number | null;
  } | null;
  validationCode: string;
};

type ComputedRow = {
  student: { student_name: string; registration_number?: string | null };
  mac: number | null;
  npp: number | null;
  npt: number | null;
  average: number | null;
  situacao: { label: string };
};

/** Linhas da pauta oficial: notas inteiras, média com uma casa. */
export function toPautaExportRows(rows: ReadonlyArray<ComputedRow>): PautaExportRow[] {
  return rows.map((entry, index) => ({
    n: String(index + 1).padStart(2, "0"),
    aluno: entry.student.student_name,
    proc: entry.student.registration_number ?? "",
    mac: formatScore(entry.mac, 0),
    npp: formatScore(entry.npp, 0),
    npt: formatScore(entry.npt, 0),
    media: formatScore(entry.average),
    situacao: entry.situacao.label,
  }));
}

export const pautaColumns = [
  { label: "Nº", value: (row: PautaExportRow) => row.n },
  { label: "Aluno", value: (row: PautaExportRow) => row.aluno },
  { label: "Proc.", value: (row: PautaExportRow) => row.proc },
  { label: "MAC", value: (row: PautaExportRow) => row.mac },
  { label: "NPP", value: (row: PautaExportRow) => row.npp },
  { label: "NPT", value: (row: PautaExportRow) => row.npt },
  { label: "Média", value: (row: PautaExportRow) => row.media },
  { label: "Situação", value: (row: PautaExportRow) => row.situacao },
];

export function exportAssessmentDocument(
  ctx: AssessmentDocumentContext,
  kind: AssessmentDocKind,
  docType: AssessmentDocType = "pauta",
) {
  const { school, meta: officialMeta, rows: officialRows, subjectName, group } = ctx;
  const slug = group?.name ?? "turma";
  if (docType === "acta") {
    void issuePrintDocument({
      tipo: "Acta do conselho de notas",
      school,
      overlay: overlayActa({
        teacherName: school.directorName ?? undefined,
        decisions: officialRows.map((row) => ({
          student: String(row.aluno),
          average: row.media,
          decision: String(row.situacao),
          observation: "",
        })),
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          `acta-${slug}`,
          "Acta do conselho de notas",
          officialMeta,
          pautaColumns,
          officialRows,
        ),
    });
    return;
  }
  if (docType === "validacao") {
    void issuePrintDocument({
      tipo: "Relatório de validação",
      school,
      overlay: overlayValidacao(
        officialRows.map((row) => ({
          item: `${row.aluno} · ${subjectName ?? "Disciplina"}`,
          status: String(row.situacao),
          note: `MAC ${row.mac} · NPP ${row.npp} · NPT ${row.npt}`,
        })),
      ),
      fallback: () =>
        exportOfficialPautaPdf(
          `validacao-${slug}`,
          "Relatório de validação de notas",
          officialMeta,
          pautaColumns,
          officialRows,
        ),
    });
    return;
  }
  if (docType === "relacao") {
    const columns = [
      { label: "Nº", value: (row: StudentListExportRow) => row.n },
      { label: "Aluno", value: (row: StudentListExportRow) => row.aluno },
      { label: "Proc.", value: (row: StudentListExportRow) => row.proc },
    ];
    const rows: StudentListExportRow[] = officialRows.map(({ n, aluno, proc }) => ({
      n,
      aluno,
      proc,
    }));
    if (kind === "excel") exportCsv(`relacao-${slug}`, columns, rows);
    else {
      void issuePrintDocument({
        tipo: "Relação de alunos",
        school,
        overlay: overlayServico({
          name: "Relação de alunos",
          areaLabel: "Pedagógica",
          reference: `REL-${rows.length}`,
          status: "Oficial",
          parties: [
            { label: "Turma", value: group?.name ?? "Turma" },
            { label: "Disciplina", value: subjectName ?? "—" },
          ],
          sections: [
            {
              title: "Alunos",
              rows: rows.map((row) => ({
                label: String(row.aluno),
                value: String(row.proc || "—"),
                note: String(row.n),
              })),
            },
          ],
        }),
        fallback: () =>
          exportOfficialPautaPdf(
            `relacao-${slug}`,
            "Relação de alunos",
            officialMeta,
            columns,
            rows,
          ),
      });
    }
    return;
  }
  if (docType === "mapa") {
    const columns = [
      { label: "Classe", value: (row: ClassMapExportRow) => row.classe },
      { label: "Curso", value: (row: ClassMapExportRow) => row.curso },
      { label: "Turma", value: (row: ClassMapExportRow) => row.turma },
      { label: "Alunos", value: (row: ClassMapExportRow) => row.alunos },
      { label: "Média", value: (row: ClassMapExportRow) => row.media },
      { label: "Transitam", value: (row: ClassMapExportRow) => row.transitam },
      { label: "Pendentes", value: (row: ClassMapExportRow) => row.pendentes },
    ];
    const rows: ClassMapExportRow[] = ctx.classMap.map((row) => ({
      classe: row.gradeName,
      curso: row.courseName,
      turma: row.name,
      alunos: row.alunos,
      media: formatScore(row.media),
      transitam: row.transitam,
      pendentes: row.pendentes,
    }));
    if (kind === "excel") exportCsv(`mapa-${slug}`, columns, rows);
    else {
      void issuePrintDocument({
        tipo: "Mapa estatístico",
        school,
        overlay: overlayMapa(
          ctx.classMap.map((row) => ({
            classGroup: row.name,
            course: row.courseName,
            total: row.alunos,
            approved: row.transitam,
            pending: row.pendentes,
            average: formatScore(row.media),
          })),
        ),
        fallback: () =>
          exportOfficialPautaPdf(
            `mapa-${slug}`,
            "Mapa de aproveitamento",
            officialMeta,
            columns,
            rows,
          ),
      });
    }
    return;
  }
  const selectedStudent = ctx.student;
  if (docType === "boletim" && selectedStudent) {
    const columns = [
      { label: "Disciplina", value: (row: Record<string, string | number>) => row["disciplina"] },
      { label: "1º T", value: (row: Record<string, string | number>) => row["t1"] },
      { label: "2º T", value: (row: Record<string, string | number>) => row["t2"] },
      { label: "3º T", value: (row: Record<string, string | number>) => row["t3"] },
      { label: "MFA", value: (row: Record<string, string | number>) => row["mfa"] },
      { label: "Situação", value: (row: Record<string, string | number>) => row["situacao"] },
    ];
    const rows = ctx.dossier.map((row) => ({
      disciplina: row.subjectName,
      t1: formatScore(row.terms[0]),
      t2: formatScore(row.terms[1]),
      t3: formatScore(row.terms[2]),
      mfa: formatScore(row.mfa),
      situacao: row.situacao.label,
    }));
    if (kind === "excel") {
      exportCsv(`boletim-${selectedStudent.student.student_name}`, columns, rows);
    } else {
      void issuePrintDocument({
        tipo: "Boletim escolar",
        school,
        student: {
          fullName: selectedStudent.student.student_name,
          academicNumber: selectedStudent.student.registration_number ?? "—",
          className: group?.name,
          programName: group?.grade_name,
          validationCode: ctx.validationCode,
        },
        overlay: overlayBoletim({
          subjects: ctx.dossier.map((row) => ({
            name: row.subjectName,
            t1: formatScore(row.terms[0]),
            t2: formatScore(row.terms[1]),
            t3: formatScore(row.terms[2]),
            mfa: formatScore(row.mfa),
            status: row.situacao.label,
          })),
          status: selectedStudent.situacao.label,
          average: formatScore(selectedStudent.average),
        }),
        fallback: () =>
          exportOfficialPautaPdf(
            `boletim-${selectedStudent.student.student_name}`,
            "Boletim de avaliação",
            { ...officialMeta, subjectName: undefined },
            columns,
            rows,
          ),
      });
    }
    return;
  }
  const { contextKind } = ctx;
  const title =
    contextKind === "aluno"
      ? "Pauta individual"
      : contextKind === "disciplina"
        ? "Pauta da disciplina"
        : contextKind === "curso"
          ? "Pauta da classe / curso"
          : "Pauta da turma";
  if (kind === "excel") exportCsv(`pauta-${slug}`, pautaColumns, officialRows);
  else {
    void issuePrintDocument({
      tipo: contextKind === "disciplina" ? "Pauta disciplinar" : "Pauta geral da turma",
      school,
      overlay: overlayPauta({
        subjectName,
        students: officialRows.map((row) => ({
          fullName: String(row.aluno),
          academicNumber: String(row.proc),
          mac: row.mac,
          npp: row.npp,
          npt: row.npt,
          average: row.media,
          status: String(row.situacao),
        })),
      }),
      fallback: () =>
        exportOfficialPautaPdf(`pauta-${slug}`, title, officialMeta, pautaColumns, officialRows),
    });
  }
}
