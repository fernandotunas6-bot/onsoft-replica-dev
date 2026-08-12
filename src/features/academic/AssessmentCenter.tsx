import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  ChevronDown,
  FileDown,
  FilePlus2,
  History,
  Lock,
  Printer,
  Save,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { PremiumModal } from "@/components/ui/premium-modal";
import { AngolaEmblem } from "@/features/academic/AngolaEmblem";
import { AssessmentGrid, type GridColumn } from "@/features/academic/AssessmentGrid";
import {
  buildClassCourseMap,
  buildStudentDossier,
  buildTermCloseChecklist,
  changeHistoryLines,
  documentValidationCode,
  rowsToTsv,
  selectIdRange,
} from "@/features/academic/assessment-views";
import {
  createAssessment,
  listAssessments,
  upsertAssessmentScores,
  upsertTermGradesBatch,
} from "@/features/academic/server";
import { setTermLock } from "@/features/school/server";
import { usePersistedListFilters } from "@/lib/list-filters";
import { exportCsv } from "@/lib/export-csv";
import { exportOfficialPautaPdf } from "@/lib/export-pdf";
import { overlayActa, overlayBoletim, overlayMapa, overlayPauta, overlayServico, overlayValidacao } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import {
  annualAverage,
  assessmentComponents,
  assessmentKinds,
  formatScore,
  parsePautaScore,
  pautaSituations,
  recursoFinal,
  scoreAverage,
  situacaoPauta,
} from "@/lib/angola-academic";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { whatsappHref } from "@/features/integrations/actions";
import { cn } from "@/lib/utils";

type EnrollmentRow = {
  id: string;
  student_name: string;
  student_photo_url?: string | null;
  registration_number?: string | null;
  class_group_id?: string | null;
  class_group_name: string;
};

type TermGradeRow = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
};

type ClassGroupOption = {
  id: string;
  name: string;
  course_name?: string;
  grade_name?: string;
};

type SubjectOption = {
  id: string;
  name: string;
  code?: string | null;
};

type WorkMode =
  | "lancamento"
  | "avaliacoes"
  | "recursos"
  | "exames"
  | "revisao"
  | "fecho"
  | "pauta"
  | "estatisticas";

type ScopeId = "alunos" | "disciplinas" | "turmas" | "classes" | "avaliacoes" | "exames";

const filterDefaults = {
  q: "",
  classe: "todas",
  curso: "todos",
  turma: "todas",
  disciplina: "todas",
  trimestre: "1",
  situacao: "todos",
};

const scopes: Array<{ id: ScopeId; label: string }> = [
  { id: "alunos", label: "Alunos" },
  { id: "disciplinas", label: "Disciplinas" },
  { id: "turmas", label: "Turmas" },
  { id: "classes", label: "Classes/Cursos" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "exames", label: "Exames" },
];

const workModes: Array<{ id: WorkMode; label: string }> = [
  { id: "lancamento", label: "Lançamento" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "recursos", label: "Recursos" },
  { id: "exames", label: "Exames" },
  { id: "revisao", label: "Revisão" },
  { id: "fecho", label: "Fecho" },
  { id: "pauta", label: "Pauta" },
  { id: "estatisticas", label: "Estatísticas" },
];

function cellKey(enrollmentId: string, field: string) {
  return `${enrollmentId}:${field}`;
}

export function AssessmentCenter({
  open,
  onOpenChange,
  schoolName,
  academicYear,
  directorName,
  classGroups,
  subjects,
  enrollments,
  termGrades,
  passingGrade,
  canLaunch,
  canLockTerm,
  closedTerms,
  initialTerm,
  initialClassGroupId,
  initialSubjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolName: string;
  academicYear: string;
  directorName?: string | null;
  classGroups: ClassGroupOption[];
  subjects: SubjectOption[];
  enrollments: EnrollmentRow[];
  termGrades: TermGradeRow[];
  passingGrade: number;
  canLaunch: boolean;
  canLockTerm: boolean;
  closedTerms: Array<1 | 2 | 3>;
  initialTerm?: string;
  initialClassGroupId?: string;
  initialSubjectId?: string;
}) {
  const queryClient = useQueryClient();
  const installed = useInstalledIntegrations();
  const turnitinOn = installed.hasCapability("turnitin.originality");
  const moodleGrades = installed.hasCapability("moodle.grades");
  const canvasWork = installed.hasCapability("canvas.assignments");
  const classroomWork = installed.hasCapability("classroom.work");
  const resendDocuments = installed.hasCapability("resend.documents");
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "avaliacao-centro",
    filterDefaults,
    { persistUrl: false },
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scope, setScope] = useState<ScopeId>("alunos");
  const [mode, setMode] = useState<WorkMode>("lancamento");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(null);
  const [batchField, setBatchField] = useState<"mac" | "npp" | "npt">("mac");
  const [batchValue, setBatchValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [history, setHistory] = useState<Array<Record<string, Record<string, string>>>>([]);
  const [future, setFuture] = useState<Array<Record<string, Record<string, string>>>>([]);
  const [autosave, setAutosave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialTerm && initialTerm !== "todos") setFilter("trimestre", initialTerm);
    if (initialClassGroupId) setFilter("turma", initialClassGroupId);
    if (initialSubjectId) {
      setFilter("disciplina", initialSubjectId);
      setScope("disciplinas");
      setMode("lancamento");
    } else if (initialClassGroupId) {
      setScope("alunos");
      setMode("lancamento");
    }
  }, [initialClassGroupId, initialSubjectId, initialTerm, open, setFilter]);

  const term = (Number(filters.trimestre) || 1) as 1 | 2 | 3;
  const termClosed = closedTerms.includes(term);
  const canEdit = canLaunch && !termClosed && mode !== "pauta";

  const selectedGroup =
    filters.turma !== "todas"
      ? (classGroups.find((group) => group.id === filters.turma) ?? null)
      : (classGroups[0] ?? null);
  const selectedSubject =
    filters.disciplina !== "todas"
      ? (subjects.find((subject) => subject.id === filters.disciplina) ?? null)
      : (subjects[0] ?? null);

  const roster = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return enrollments
      .filter((row) => filters.turma === "todas" || row.class_group_id === filters.turma)
      .filter((row) => {
        const group = classGroups.find((item) => item.id === row.class_group_id);
        if (filters.classe !== "todas" && group?.grade_name !== filters.classe) return false;
        if (filters.curso !== "todos" && group?.course_name !== filters.curso) return false;
        return true;
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.student_name.toLowerCase().includes(q) ||
          String(row.registration_number ?? "").toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => a.student_name.localeCompare(b.student_name, "pt"));
  }, [classGroups, enrollments, filters.classe, filters.curso, filters.q, filters.turma]);

  const assessmentsQuery = useQuery({
    queryKey: ["academic", "assessments", selectedGroup?.id, selectedSubject?.id, term],
    queryFn: () =>
      listAssessments({
        data: {
          classGroupId: selectedGroup?.id,
          subjectId: selectedSubject?.id,
          term,
        },
      }),
    enabled: open && Boolean(selectedGroup?.id && selectedSubject?.id),
    retry: false,
  });

  const items = assessmentsQuery.data?.items ?? [];
  const scores = assessmentsQuery.data?.scores ?? [];
  const assessmentsAvailable = assessmentsQuery.data?.available !== false;

  useEffect(() => {
    if (!open) return;
    const next: Record<string, Record<string, string>> = {};
    for (const student of roster) {
      const grade = termGrades.find(
        (row) =>
          row.enrollment_id === student.id &&
          row.subject_id === selectedSubject?.id &&
          row.term === term,
      );
      const row: Record<string, string> = {
        mac: grade ? String(grade.mac) : "",
        npp: grade ? String(grade.npp) : "",
        npt: grade ? String(grade.npt) : "",
      };
      for (const item of items) {
        const score = scores.find(
          (entry) => String(entry.item_id) === String(item.id) && String(entry.enrollment_id) === student.id,
        );
        row[String(item.id)] = score?.score == null ? "" : String(score.score);
      }
      next[student.id] = row;
    }
    setValues(next);
    setHistory([]);
    setFuture([]);
  }, [items, open, roster, scores, selectedSubject?.id, term, termGrades]);

  const pushHistory = (snapshot: Record<string, Record<string, string>>) => {
    setHistory((current) => [...current.slice(-29), snapshot]);
    setFuture([]);
  };

  const updateCell = (enrollmentId: string, key: string, value: string) => {
    setValues((current) => {
      pushHistory(current);
      return {
        ...current,
        [enrollmentId]: { ...(current[enrollmentId] ?? {}), [key]: value },
      };
    });
  };

  const undo = () => {
    setHistory((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setFuture((next) => [values, ...next]);
      setValues(previous);
      return current.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((current) => {
      const [next, ...rest] = current;
      if (!next) return current;
      setHistory((historyRows) => [...historyRows, values]);
      setValues(next);
      return rest;
    });
  };

  const baseline = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of roster) {
      const grade = termGrades.find(
        (row) =>
          row.enrollment_id === student.id &&
          row.subject_id === selectedSubject?.id &&
          row.term === term,
      );
      map.set(cellKey(student.id, "mac"), grade ? String(grade.mac) : "");
      map.set(cellKey(student.id, "npp"), grade ? String(grade.npp) : "");
      map.set(cellKey(student.id, "npt"), grade ? String(grade.npt) : "");
      for (const item of items) {
        const score = scores.find(
          (entry) => String(entry.item_id) === String(item.id) && String(entry.enrollment_id) === student.id,
        );
        map.set(cellKey(student.id, String(item.id)), score?.score == null ? "" : String(score.score));
      }
    }
    return map;
  }, [items, roster, scores, selectedSubject?.id, term, termGrades]);

  const dirtyKeys = useMemo(() => {
    const dirty = new Set<string>();
    for (const student of roster) {
      const row = values[student.id] ?? {};
      for (const key of ["mac", "npp", "npt", ...items.map((item) => String(item.id))]) {
        const id = cellKey(student.id, key);
        if ((row[key] ?? "") !== (baseline.get(id) ?? "")) dirty.add(id);
      }
    }
    return dirty;
  }, [baseline, items, roster, values]);

  const computedRows = roster.map((student) => {
    const row = values[student.id] ?? {};
    const fromItems = (component: string) =>
      items
        .filter((item) => item.component === component && item.counts_toward_pauta)
        .map((item) => parsePautaScore(row[String(item.id)] ?? ""));
    const mac =
      parsePautaScore(row.mac ?? "") ??
      annualAverage(fromItems("MAC").filter((value) => value != null && !Number.isNaN(value)));
    const npp =
      parsePautaScore(row.npp ?? "") ??
      annualAverage(fromItems("NPP").filter((value) => value != null && !Number.isNaN(value)));
    const npt =
      parsePautaScore(row.npt ?? "") ??
      annualAverage(fromItems("NPT").filter((value) => value != null && !Number.isNaN(value)));
    const average = mac != null && npp != null && npt != null ? scoreAverage(mac, npp, npt) : null;
    const recurso = annualAverage(
      items
        .filter((item) => item.component === "recurso")
        .map((item) => parsePautaScore(row[String(item.id)] ?? ""))
        .filter((value): value is number => value != null && !Number.isNaN(value)),
    );
    const exame = annualAverage(
      items
        .filter((item) => item.component === "exame")
        .map((item) => parsePautaScore(row[String(item.id)] ?? ""))
        .filter((value): value is number => value != null && !Number.isNaN(value)),
    );
    const finalScore = exame ?? recursoFinal(average, recurso);
    const situacao =
      finalScore == null ? { label: "Pendente", tone: "muted" as const } : situacaoPauta(finalScore, passingGrade);
    return { student, mac, npp, npt, average, recurso, exame, finalScore, situacao, row };
  });

  const visibleRows = computedRows.filter((entry) => {
    if (mode === "revisao") {
      const dirty = ["mac", "npp", "npt"].some((key) => dirtyKeys.has(cellKey(entry.student.id, key)));
      return entry.average == null || dirty;
    }
    if (filters.situacao === "todos") return true;
    if (filters.situacao === "pendente") return entry.average == null;
    if (filters.situacao === "completo") return entry.average != null;
    if (filters.situacao === "transita") return entry.situacao.label === "Transita";
    if (filters.situacao === "nao_transita") return entry.situacao.label === "Não transita";
    if (filters.situacao === "em_recurso") return entry.recurso != null;
    if (filters.situacao === "aprovado") return (entry.exame ?? entry.finalScore ?? 0) >= passingGrade;
    if (filters.situacao === "reprovado")
      return entry.finalScore != null && entry.finalScore < passingGrade;
    return true;
  });

  const selectedStudent = visibleRows.find((row) => row.student.id === selectedId) ?? null;
  const contextLabel = [
    selectedGroup?.grade_name,
    selectedGroup?.name,
    selectedSubject?.name,
    `${term}º trimestre`,
    selectedStudent?.student.student_name,
  ]
    .filter(Boolean)
    .join(" › ");

  const contextKind =
    scope === "classes"
      ? "curso"
      : scope === "turmas"
        ? "turma"
        : selectedStudent || scope === "alunos"
          ? "aluno"
          : selectedSubject || scope === "disciplinas"
            ? "disciplina"
            : "turma";

  const dossier = selectedStudent
    ? buildStudentDossier(termGrades, subjects, selectedStudent.student.id, passingGrade)
    : [];
  const classMap = buildClassCourseMap(
    classGroups.filter((group) => {
      if (filters.classe !== "todas" && group.grade_name !== filters.classe) return false;
      if (filters.curso !== "todos" && group.course_name !== filters.curso) return false;
      return true;
    }),
    enrollments,
    termGrades,
    passingGrade,
  );
  const historyLines = changeHistoryLines(scores, items, roster);

  const columns: GridColumn[] = [
    { key: "mac", label: "MAC", editable: true, width: "w-20" },
    { key: "npp", label: "NPP", editable: true, width: "w-20" },
    { key: "npt", label: "NPT", editable: true, width: "w-20" },
    ...items
      .filter((item) => {
        if (mode === "recursos") return item.component === "recurso";
        if (mode === "exames") return item.component === "exame";
        return item.component !== "recurso" && item.component !== "exame";
      })
      .map((item) => ({
        key: String(item.id),
        label: String(item.name),
        editable: true,
        title: `${item.kind} · ${item.component}`,
      })),
    { key: "media", label: "Média", editable: false },
    { key: "situacao", label: "Situação", editable: false },
  ];

  const gridValues = Object.fromEntries(
    visibleRows.map((entry) => [
      entry.student.id,
      {
        ...entry.row,
        media: formatScore(entry.average),
        situacao: entry.situacao.label,
      },
    ]),
  );

  const pendingCount = visibleRows.filter((row) => row.average == null).length;
  const classAverage = annualAverage(visibleRows.map((row) => row.average));
  const dirtyCount = dirtyKeys.size;
  const invalidCount = visibleRows.reduce((count, entry) => {
    return (
      count +
      ["mac", "npp", "npt"].filter((key) => {
        const value = entry.row[key] ?? "";
        return value.trim() !== "" && Number.isNaN(parsePautaScore(value));
      }).length
    );
  }, 0);
  const closeChecklist = buildTermCloseChecklist({
    total: visibleRows.length,
    pending: pendingCount,
    dirty: dirtyCount,
    invalid: invalidCount,
    closed: termClosed,
  });
  const validationCode = documentValidationCode([
    schoolName,
    academicYear,
    selectedGroup?.name,
    selectedSubject?.name,
    String(term),
  ]);

  const saveChanges = async () => {
    if (!selectedSubject?.id || !canEdit) return;
    setSaving(true);
    try {
      for (const item of items) {
        const rows = visibleRows
          .map((entry) => ({
            enrollmentId: entry.student.id,
            score: parsePautaScore(entry.row[String(item.id)] ?? ""),
          }))
          .filter((row) => row.score != null && !Number.isNaN(row.score))
          .map((row) => ({ enrollmentId: row.enrollmentId, score: row.score as number }));
        if (rows.length) {
          await upsertAssessmentScores({ data: { itemId: String(item.id), rows } });
        }
      }
      const pautaRows = visibleRows.flatMap((entry) => {
        if (entry.mac == null || entry.npp == null || entry.npt == null) return [];
        return [
          {
            enrollmentId: entry.student.id,
            mac: entry.mac,
            npp: entry.npp,
            npt: entry.npt,
          },
        ];
      });
      if (pautaRows.length) {
        await upsertTermGradesBatch({
          data: { subjectId: selectedSubject.id, term, rows: pautaRows },
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["academic"] });
      toast.success(
        contextKind === "aluno"
          ? "Avaliação do aluno guardada"
          : contextKind === "disciplina"
            ? "Pauta da disciplina guardada"
            : "Pauta da turma guardada",
      );
      setSaveOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!autosave || dirtyCount === 0 || !canEdit) return;
    const timer = window.setTimeout(() => {
      void saveChanges();
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [autosave, canEdit, dirtyCount]);

  const officialRows = visibleRows.map((entry, index) => ({
    n: String(index + 1).padStart(2, "0"),
    aluno: entry.student.student_name,
    proc: entry.student.registration_number ?? "",
    mac: formatScore(entry.mac, 0),
    npp: formatScore(entry.npp, 0),
    npt: formatScore(entry.npt, 0),
    media: formatScore(entry.average),
    situacao: entry.situacao.label,
  }));

  const officialMeta = {
    schoolName,
    academicYear,
    gradeName: selectedGroup?.grade_name,
    courseName: selectedGroup?.course_name,
    className: selectedGroup?.name,
    subjectName: selectedSubject?.name,
    termLabel: `${term}º trimestre`,
    directorName: directorName ?? undefined,
    validationCode,
  };

  const pautaColumns = [
    { label: "Nº", value: (row: Record<string, string | number>) => row.n },
    { label: "Aluno", value: (row: Record<string, string | number>) => row.aluno },
    { label: "Proc.", value: (row: Record<string, string | number>) => row.proc },
    { label: "MAC", value: (row: Record<string, string | number>) => row.mac },
    { label: "NPP", value: (row: Record<string, string | number>) => row.npp },
    { label: "NPT", value: (row: Record<string, string | number>) => row.npt },
    { label: "Média", value: (row: Record<string, string | number>) => row.media },
    { label: "Situação", value: (row: Record<string, string | number>) => row.situacao },
  ];

  const printSchool = {
    name: schoolName,
    directorName: directorName ?? undefined,
    academicYear,
  };

  const exportDocument = (
    kind: "pdf" | "excel",
    docType: "pauta" | "boletim" | "mapa" | "relacao" | "acta" | "validacao" = "pauta",
  ) => {
    const slug = selectedGroup?.name ?? "turma";
    if (docType === "acta") {
      void issuePrintDocument({
        tipo: "Acta do conselho de notas",
        school: printSchool,
        overlay: overlayActa({
          teacherName: directorName ?? undefined,
          decisions: officialRows.map((row) => ({
            student: String(row.aluno),
            average: row.media,
            decision: String(row.situacao),
            observation: "",
          })),
        }),
        fallback: () =>
          exportOfficialPautaPdf(`acta-${slug}`, "Acta do conselho de notas", officialMeta, pautaColumns, officialRows),
      });
      return;
    }
    if (docType === "validacao") {
      void issuePrintDocument({
        tipo: "Relatório de validação",
        school: printSchool,
        overlay: overlayValidacao(
          officialRows.map((row) => ({
            item: `${row.aluno} · ${selectedSubject?.name ?? "Disciplina"}`,
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
        { label: "Nº", value: (row: Record<string, string | number>) => row.n },
        { label: "Aluno", value: (row: Record<string, string | number>) => row.aluno },
        { label: "Proc.", value: (row: Record<string, string | number>) => row.proc },
      ];
      const rows = officialRows.map(({ n, aluno, proc }) => ({ n, aluno, proc }));
      if (kind === "excel") exportCsv(`relacao-${slug}`, columns, rows);
      else {
        void issuePrintDocument({
          tipo: "Relação de alunos",
          school: printSchool,
          overlay: overlayServico({
            name: "Relação de alunos",
            areaLabel: "Pedagógica",
            reference: `REL-${rows.length}`,
            status: "Oficial",
            parties: [
              { label: "Turma", value: selectedGroup?.name ?? "Turma" },
              { label: "Disciplina", value: selectedSubject?.name ?? "—" },
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
            exportOfficialPautaPdf(`relacao-${slug}`, "Relação de alunos", officialMeta, columns, rows),
        });
      }
      return;
    }
    if (docType === "mapa") {
      const columns = [
        { label: "Classe", value: (row: Record<string, string | number>) => row.classe },
        { label: "Curso", value: (row: Record<string, string | number>) => row.curso },
        { label: "Turma", value: (row: Record<string, string | number>) => row.turma },
        { label: "Alunos", value: (row: Record<string, string | number>) => row.alunos },
        { label: "Média", value: (row: Record<string, string | number>) => row.media },
        { label: "Transitam", value: (row: Record<string, string | number>) => row.transitam },
        { label: "Pendentes", value: (row: Record<string, string | number>) => row.pendentes },
      ];
      const rows = classMap.map((row) => ({
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
          school: printSchool,
          overlay: overlayMapa(
            classMap.map((row) => ({
              classGroup: row.name,
              course: row.courseName,
              total: row.alunos,
              approved: row.transitam,
              pending: row.pendentes,
              average: formatScore(row.media),
            })),
          ),
          fallback: () =>
            exportOfficialPautaPdf(`mapa-${slug}`, "Mapa de aproveitamento", officialMeta, columns, rows),
        });
      }
      return;
    }
    if (docType === "boletim" && selectedStudent) {
      const columns = [
        { label: "Disciplina", value: (row: Record<string, string | number>) => row.disciplina },
        { label: "1º T", value: (row: Record<string, string | number>) => row.t1 },
        { label: "2º T", value: (row: Record<string, string | number>) => row.t2 },
        { label: "3º T", value: (row: Record<string, string | number>) => row.t3 },
        { label: "MFA", value: (row: Record<string, string | number>) => row.mfa },
        { label: "Situação", value: (row: Record<string, string | number>) => row.situacao },
      ];
      const rows = dossier.map((row) => ({
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
          school: printSchool,
          student: {
            fullName: selectedStudent.student.student_name,
            academicNumber: selectedStudent.student.registration_number ?? "—",
            className: selectedGroup?.name,
            programName: selectedGroup?.grade_name,
            validationCode,
          },
          overlay: overlayBoletim({
            subjects: dossier.map((row) => ({
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
        school: printSchool,
        overlay: overlayPauta({
          subjectName: selectedSubject?.name,
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
  };

  const applyBatch = () => {
    const parsed = parsePautaScore(batchValue);
    if (parsed == null || Number.isNaN(parsed) || checkedIds.size === 0) return;
    setValues((current) => {
      pushHistory(current);
      const next = { ...current };
      for (const id of checkedIds) {
        next[id] = { ...(next[id] ?? {}), [batchField]: String(parsed) };
      }
      return next;
    });
    toast.success(`Nota aplicada a ${checkedIds.size} aluno(s)`);
  };

  const toggleChecked = (id: string, shiftKey: boolean) => {
    const ids = visibleRows.map((row) => row.student.id);
    const range = shiftKey ? selectIdRange(ids, lastCheckedId, id) : [id];
    setCheckedIds((current) => {
      const next = new Set(current);
      for (const item of range) {
        if (next.has(item) && !shiftKey) next.delete(item);
        else next.add(item);
      }
      return next;
    });
    setLastCheckedId(id);
  };

  const toggleAll = () => {
    const ids = visibleRows.map((row) => row.student.id);
    setCheckedIds((current) =>
      ids.length > 0 && ids.every((id) => current.has(id)) ? new Set() : new Set(ids),
    );
  };

  const fillDown = () => {
    if (!selectedId) return;
    const source = values[selectedId];
    if (!source) return;
    setValues((current) => {
      pushHistory(current);
      const next = { ...current };
      for (const entry of visibleRows) {
        next[entry.student.id] = { ...source };
      }
      return next;
    });
  };

  const copyPreviousTerm = () => {
    if (term < 2 || !selectedSubject?.id) return;
    const previous = roster.flatMap((student) => {
      const grade = termGrades.find(
        (row) =>
          row.enrollment_id === student.id &&
          row.subject_id === selectedSubject.id &&
          row.term === term - 1,
      );
      return grade ? [{ id: student.id, grade }] : [];
    });
    if (previous.length === 0) {
      toast.error("Não há notas do trimestre anterior nesta disciplina.");
      return;
    }
    setValues((current) => {
      pushHistory(current);
      const next = { ...current };
      for (const { id, grade } of previous) {
        next[id] = {
          ...(next[id] ?? {}),
          mac: String(grade.mac),
          npp: String(grade.npp),
          npt: String(grade.npt),
        };
      }
      return next;
    });
    toast.success(
      `Copiámos ${previous.length} aluno(s) do ${term - 1}º trimestre. Revise e guarde.`,
    );
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("\t"));
    setValues((current) => {
      pushHistory(current);
      const next = { ...current };
      visibleRows.forEach((entry, index) => {
        const cells = lines[index];
        if (!cells) return;
        next[entry.student.id] = {
          ...(next[entry.student.id] ?? {}),
          mac: cells[0] ?? next[entry.student.id]?.mac ?? "",
          npp: cells[1] ?? next[entry.student.id]?.npp ?? "",
          npt: cells[2] ?? next[entry.student.id]?.npt ?? "",
        };
      });
      return next;
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        fillDown();
      }
    };
    if (!open) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const classes = Array.from(new Set(classGroups.map((group) => group.grade_name).filter(Boolean)));
  const courses = Array.from(new Set(classGroups.map((group) => group.course_name).filter(Boolean)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[96vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="flex items-center justify-between border-b px-5 py-3 print:hidden">
          <div>
            <DialogTitle className="font-display text-xl font-extrabold">
              {schoolName}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Grelha de lançamento de notas e geração de pautas oficiais.
            </DialogDescription>
          </div>
          <p className="text-xs text-muted-foreground">{academicYear}</p>
        </div>

        <div className="border-b px-5 py-2 text-sm print:hidden">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Contexto
          </span>
          <p className="font-semibold">{contextLabel || "Seleccione turma e disciplina"}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2 print:hidden">
          {scopes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setScope(item.id);
                if (item.id === "avaliacoes") setMode("avaliacoes");
                if (item.id === "exames") setMode("exames");
                if (item.id === "alunos" || item.id === "disciplinas") setMode("lancamento");
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold",
                scope === item.id
                  ? "bg-foreground text-background"
                  : "bg-muted/70 text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2 print:hidden">
          {workModes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                mode === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            Filtros {activeCount ? `(${activeCount})` : ""}
            <ChevronDown className={cn("size-3.5 transition", filtersOpen && "rotate-180")} />
          </button>
        </div>

        {filtersOpen ? (
          <div className="border-b px-5 py-3">
            <ListFilterBar
              values={filters}
              onChange={(name, value) => setFilter(name as keyof typeof filterDefaults, value)}
              onReset={resetFilters}
              activeCount={activeCount}
              fields={[
                { name: "q", type: "search", placeholder: "Nome, nº ou processo…" },
                {
                  name: "classe",
                  label: "Classe",
                  type: "select",
                  options: [
                    { value: "todas", label: "Todas" },
                    ...classes.map((item) => ({ value: String(item), label: String(item) })),
                  ],
                },
                {
                  name: "curso",
                  label: "Curso",
                  type: "select",
                  options: [
                    { value: "todos", label: "Todos" },
                    ...courses.map((item) => ({ value: String(item), label: String(item) })),
                  ],
                },
                {
                  name: "turma",
                  label: "Turma",
                  type: "select",
                  options: [
                    { value: "todas", label: "Todas" },
                    ...classGroups.map((group) => ({ value: group.id, label: group.name })),
                  ],
                },
                {
                  name: "disciplina",
                  label: "Disciplina",
                  type: "select",
                  options: [
                    { value: "todas", label: "Todas" },
                    ...subjects.map((subject) => ({ value: subject.id, label: subject.name })),
                  ],
                },
                {
                  name: "trimestre",
                  label: "Trimestre",
                  type: "select",
                  options: [
                    { value: "1", label: "1º" },
                    { value: "2", label: "2º" },
                    { value: "3", label: "3º" },
                  ],
                },
                {
                  name: "situacao",
                  label: "Situação",
                  type: "select",
                  options: pautaSituations.map((item) => ({ value: item.id, label: item.label })),
                },
              ]}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2 print:hidden">
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)} disabled={!canEdit}>
            <FilePlus2 className="size-3.5" /> + Avaliação
          </Button>
          <Button size="sm" variant="outline" onClick={fillDown} disabled={!canEdit || !selectedId}>
            Preencher abaixo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={copyPreviousTerm}
            disabled={!canEdit || term < 2}
          >
            Copiar trimestre anterior
          </Button>
          <Button size="sm" variant="outline" onClick={undo} disabled={!history.length}>
            Desfazer
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={!future.length}>
            Refazer
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDocsOpen((value) => !value)}>
            <FileDown className="size-3.5" /> Documentos
          </Button>
          {turnitinOn ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const payload = [
                  schoolName,
                  academicYear,
                  `T${term}`,
                  selectedGroup?.name ?? "turma",
                  `${checkedIds.size || enrollments.length} trabalhos`,
                ].join(" · ");
                await navigator.clipboard.writeText(payload);
                toast.success("Lote Turnitin copiado", {
                  description: "Cole no Turnitin ou abra o guia oficial.",
                });
                window.open("https://developers.turnitin.com/", "_blank", "noopener,noreferrer");
              }}
            >
              Turnitin
            </Button>
          ) : null}
          {classroomWork ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open("https://classroom.google.com/", "_blank", "noopener,noreferrer")
              }
            >
              Trabalhos
            </Button>
          ) : null}
          {moodleGrades ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open("https://docs.moodle.org/en/Gradebook", "_blank", "noopener,noreferrer")
              }
            >
              Notas Moodle
            </Button>
          ) : null}
          {canvasWork ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  "https://canvas.instructure.com/doc/api/assignments.html",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Canvas
            </Button>
          ) : null}
          {whatsappOn ? (
            <Button size="sm" variant="outline" asChild>
              <a
                href={whatsappHref(
                  "",
                  `Centro de Avaliação · ${selectedGroup?.name ?? "turma"} · T${term} · ${academicYear}`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            </Button>
          ) : null}
          {resendDocuments ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `Centro de Avaliação · ${selectedGroup?.name ?? "turma"} · T${term} · ${academicYear}\n${schoolName}`,
                );
                toast.success("Resumo copiado para e-mail Resend");
              }}
            >
              E-mail
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportDocument("pdf")}
          >
            <Printer className="size-3.5" /> Imprimir
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setHistoryOpen((value) => !value)}
          >
            <History className="size-3.5" /> Histórico
          </Button>
          {canLockTerm ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!termClosed && !closeChecklist.ready}
              onClick={() =>
                void setTermLock({ data: { term, closed: !termClosed } }).then(() =>
                  queryClient.invalidateQueries({ queryKey: ["school", "settings"] }),
                )
              }
            >
              {termClosed ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
              {termClosed ? "Reabrir" : "Fechar trimestre"}
            </Button>
          ) : null}
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            {saving && autosave ? "A guardar…" : autosave ? "Autosave" : "Autosave"}
            <Switch checked={autosave} onCheckedChange={setAutosave} disabled={!canEdit} />
          </label>
        </div>

        {docsOpen ? (
          <div className="border-b bg-muted/30 px-5 py-3 text-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Gerar para {contextKind}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => exportDocument("pdf")}>
                {contextKind === "aluno"
                  ? "Pauta individual PDF"
                  : contextKind === "disciplina"
                    ? "Pauta da disciplina PDF"
                    : "Pauta da turma PDF"}
              </Button>
              {selectedStudent ? (
                <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "boletim")}>
                  Boletim do aluno
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "relacao")}>
                Relação de alunos
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "mapa")}>
                Mapa de aproveitamento
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "acta")}>
                Acta do conselho
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "validacao")}>
                Validação de notas
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportDocument("excel")}>
                Exportar Excel
              </Button>
            </div>
          </div>
        ) : null}

        {historyOpen ? (
          <div className="border-b bg-muted/20 px-5 py-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Histórico (nota original → nova)
            </p>
            {historyLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há alterações gravadas neste contexto.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {historyLines.slice(0, 12).map((line) => (
                  <li key={line.id}>
                    <span className="font-semibold">{line.studentName}</span> · {line.itemName}:{" "}
                    {formatScore(line.previous)} → {formatScore(line.current)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3" onPaste={onPaste}>
          {scope === "classes" || scope === "turmas" ? (
            <ClassCourseTable
              rows={classMap}
              onOpen={(groupId) => {
                setFilter("turma", groupId);
                setScope("alunos");
                setMode("lancamento");
              }}
            />
          ) : scope === "alunos" && selectedStudent ? (
            <StudentDossierTable
              studentName={selectedStudent.student.student_name}
              rows={dossier}
              onBack={() => setSelectedId(null)}
              onOpenSubject={(subjectId) => {
                setFilter("disciplina", subjectId);
                setScope("disciplinas");
                setMode("lancamento");
              }}
            />
          ) : mode === "pauta" ? (
            <OfficialPautaView
              schoolName={schoolName}
              academicYear={academicYear}
              meta={officialMeta}
              rows={officialRows}
            />
          ) : mode === "estatisticas" ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Alunos" value={String(visibleRows.length)} />
              <Stat label="Pendentes" value={String(pendingCount)} />
              <Stat label="Média da turma" value={formatScore(classAverage)} />
              <Stat
                label="Transitam"
                value={String(visibleRows.filter((row) => row.situacao.label === "Transita").length)}
              />
            </div>
          ) : mode === "avaliacoes" ? (
            <div className="space-y-2">
              {!assessmentsAvailable ? (
                <p className="text-sm text-muted-foreground">
                  Aplique <code>APPLY_ENROLLMENT_AND_PREMIUM.sql</code> para criar avaliações detalhadas.
                </p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ainda não há avaliações neste contexto. Use + Avaliação.
                </p>
              ) : (
                items.map((item) => (
                  <div key={String(item.id)} className="rounded-xl border px-3 py-2">
                    <p className="font-semibold">{String(item.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(item.kind)} · {String(item.component)} · conta para a pauta:{" "}
                      {item.counts_toward_pauta ? "sim" : "não"}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : mode === "recursos" ? (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/70">
                  <tr>
                    <th className="px-3 py-2 text-left">Aluno</th>
                    <th className="px-3 py-2 text-left">Disciplina</th>
                    <th className="px-3 py-2 text-right">Média anterior</th>
                    <th className="px-3 py-2 text-right">Recurso</th>
                    <th className="px-3 py-2 text-right">Nova nota</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.student.id} className="border-t">
                      <td className="px-3 py-2 font-semibold">{row.student.student_name}</td>
                      <td className="px-3 py-2">{selectedSubject?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{formatScore(row.average)}</td>
                      <td className="px-3 py-2 text-right">{formatScore(row.recurso)}</td>
                      <td className="px-3 py-2 text-right font-bold">
                        {formatScore(recursoFinal(row.average, row.recurso))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : mode === "exames" ? (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/70">
                  <tr>
                    <th className="px-3 py-2 text-left">Aluno</th>
                    <th className="px-3 py-2 text-left">Disciplina</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Nota</th>
                    <th className="px-3 py-2 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.student.id} className="border-t">
                      <td className="px-3 py-2 font-semibold">{row.student.student_name}</td>
                      <td className="px-3 py-2">{selectedSubject?.name ?? "—"}</td>
                      <td className="px-3 py-2">Exame</td>
                      <td className="px-3 py-2 text-right">{formatScore(row.exame)}</td>
                      <td className="px-3 py-2 text-right">
                        {row.exame == null
                          ? "Pendente"
                          : row.exame >= passingGrade
                            ? "Aprovado"
                            : "Reprovado"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : mode === "fecho" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {termClosed
                  ? "Este trimestre está fechado. As células da pauta estão bloqueadas."
                  : "Só feche quando a pauta estiver completa e guardada."}
              </p>
              <ul className="space-y-2">
                {closeChecklist.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                  >
                    <span>{item.label}</span>
                    <span className={item.ok ? "font-semibold text-emerald-600" : "font-semibold text-destructive"}>
                      {item.ok ? "Pronto" : "Bloqueia"}
                    </span>
                  </li>
                ))}
              </ul>
              {canLockTerm ? (
                <Button
                  disabled={!termClosed && !closeChecklist.ready}
                  onClick={() =>
                    void setTermLock({ data: { term, closed: !termClosed } }).then(() =>
                      queryClient.invalidateQueries({ queryKey: ["school", "settings"] }),
                    )
                  }
                >
                  {termClosed ? "Reabrir trimestre" : "Fechar trimestre"}
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {canEdit && checkedIds.size > 0 ? (
                <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {checkedIds.size} seleccionado(s)
                  </p>
                  <select
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                    value={batchField}
                    onChange={(event) => setBatchField(event.target.value as "mac" | "npp" | "npt")}
                  >
                    <option value="mac">MAC</option>
                    <option value="npp">NPP</option>
                    <option value="npt">NPT</option>
                  </select>
                  <Input
                    className="h-9 w-24"
                    inputMode="decimal"
                    placeholder="0–20"
                    value={batchValue}
                    onChange={(event) => setBatchValue(event.target.value)}
                  />
                  <Button size="sm" onClick={applyBatch}>
                    Aplicar aos seleccionados
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const selected = visibleRows.filter((row) => checkedIds.has(row.student.id));
                      const text = rowsToTsv([
                        ["Aluno", "Proc.", "MAC", "NPP", "NPT", "Média"],
                        ...selected.map((row) => [
                          row.student.student_name,
                          row.student.registration_number,
                          row.mac,
                          row.npp,
                          row.npt,
                          row.average,
                        ]),
                      ]);
                      void navigator.clipboard.writeText(text);
                      toast.success("Linhas copiadas para o Excel");
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              ) : null}
              <AssessmentGrid
                students={visibleRows.map((row) => row.student)}
                columns={columns}
                values={gridValues}
                dirtyKeys={dirtyKeys}
                selectedId={selectedId}
                checkedIds={checkedIds}
                readOnly={!canEdit}
                onChange={updateCell}
                onSelect={setSelectedId}
                onToggle={toggleChecked}
                onToggleAll={toggleAll}
                onCommitMove={() => undefined}
              />
            </>
          )}

          {selectedStudent && mode === "lancamento" && scope !== "alunos" ? (
            <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
              <p className="font-semibold">{selectedStudent.student.student_name} · detalhe MAC/NPP/NPT</p>
              {(["MAC", "NPP", "NPT"] as const).map((component) => (
                <div key={component} className="mt-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {component}
                  </p>
                  {items.filter((item) => item.component === component).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem avaliações neste componente.</p>
                  ) : (
                    items
                      .filter((item) => item.component === component)
                      .map((item) => (
                        <p key={String(item.id)} className="text-xs">
                          {String(item.name)} ………… {selectedStudent.row[String(item.id)] || "—"}
                        </p>
                      ))
                  )}
                </div>
              ))}
              <p className="mt-2 font-bold">Média ………… {formatScore(selectedStudent.average)}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-secondary/40 px-5 py-3 print:hidden">
          <p className="text-xs text-muted-foreground">
            {visibleRows.length} alunos · {pendingCount} pendente(s) · {dirtyCount} alteração(ões) ·
            média da turma {formatScore(classAverage)}
            {termClosed ? " · trimestre fechado" : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportDocument("pdf")}>
              Guardar como PDF
            </Button>
            <Button className="gap-1.5" disabled={!canEdit || dirtyCount === 0 || saving} onClick={() => setSaveOpen(true)}>
              <Save className="size-3.5" /> Guardar
            </Button>
          </div>
        </div>

        <PremiumModal
          open={saveOpen}
          onOpenChange={setSaveOpen}
          eyebrow="Guardar"
          title="Guardar alterações"
          description={contextLabel}
          icon={<Save className="size-5" />}
          footer={
            <>
              <Button variant="outline" onClick={() => exportDocument("pdf")}>
                PDF
              </Button>
              <Button variant="outline" onClick={() => exportDocument("excel")}>
                Excel
              </Button>
              <Button onClick={() => void saveChanges()} disabled={saving}>
                {saving
                  ? "A guardar…"
                  : contextKind === "aluno"
                    ? "Guardar avaliação do aluno"
                    : contextKind === "disciplina"
                      ? "Guardar pauta da disciplina"
                      : "Guardar pauta da turma"}
              </Button>
            </>
          }
        >
          <p className="text-sm">
            {visibleRows.length} alunos · {dirtyCount} alterações neste contexto.
          </p>
        </PremiumModal>

        <CreateAssessmentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          classGroupId={selectedGroup?.id}
          subjectId={selectedSubject?.id}
          term={term}
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["academic", "assessments"] })
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function ClassCourseTable({
  rows,
  onOpen,
}: {
  rows: ReturnType<typeof buildClassCourseMap>;
  onOpen: (groupId: string) => void;
}) {
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="px-3 py-2 text-left">Classe</th>
            <th className="px-3 py-2 text-left">Curso</th>
            <th className="px-3 py-2 text-left">Turma</th>
            <th className="px-3 py-2 text-right">Alunos</th>
            <th className="px-3 py-2 text-right">Média</th>
            <th className="px-3 py-2 text-right">Transitam</th>
            <th className="px-3 py-2 text-right">Pendentes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t hover:bg-muted/40"
              onClick={() => onOpen(row.id)}
            >
              <td className="px-3 py-2">{row.gradeName}</td>
              <td className="px-3 py-2">{row.courseName}</td>
              <td className="px-3 py-2 font-semibold">{row.name}</td>
              <td className="px-3 py-2 text-right">{row.alunos}</td>
              <td className="px-3 py-2 text-right">{formatScore(row.media)}</td>
              <td className="px-3 py-2 text-right">{row.transitam}</td>
              <td className="px-3 py-2 text-right">{row.pendentes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentDossierTable({
  studentName,
  rows,
  onBack,
  onOpenSubject,
}: {
  studentName: string;
  rows: ReturnType<typeof buildStudentDossier>;
  onBack: () => void;
  onOpenSubject: (subjectId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {studentName} · todas as disciplinas e trimestres
        </p>
        <Button size="sm" variant="outline" onClick={onBack}>
          Voltar à grelha
        </Button>
      </div>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/70">
            <tr>
              <th className="px-3 py-2 text-left">Disciplina</th>
              <th className="px-3 py-2 text-right">1º T</th>
              <th className="px-3 py-2 text-right">2º T</th>
              <th className="px-3 py-2 text-right">3º T</th>
              <th className="px-3 py-2 text-right">MFA</th>
              <th className="px-3 py-2 text-right">Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.subjectId}
                className="cursor-pointer border-t hover:bg-muted/40"
                onClick={() => onOpenSubject(row.subjectId)}
              >
                <td className="px-3 py-2 font-semibold">{row.subjectName}</td>
                {row.terms.map((value, index) => (
                  <td key={index} className="px-3 py-2 text-right">
                    {formatScore(value)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-bold">{formatScore(row.mfa)}</td>
                <td className="px-3 py-2 text-right">{row.situacao.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function OfficialPautaView({
  schoolName,
  academicYear,
  meta,
  rows,
}: {
  schoolName: string;
  academicYear: string;
  meta: {
    gradeName?: string;
    courseName?: string;
    className?: string;
    subjectName?: string;
    termLabel?: string;
    validationCode?: string;
  };
  rows: Array<Record<string, string>>;
}) {
  return (
    <div id="siga-pauta-oficial" className="mx-auto max-w-4xl bg-white px-8 py-10 text-black shadow-soft print:shadow-none">
      <div className="text-center">
        <AngolaEmblem className="mx-auto size-20" />
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em]">República de Angola</p>
        <p className="text-xs uppercase tracking-[0.16em]">Ministério da Educação</p>
        <h2 className="mt-3 font-display text-2xl font-extrabold">{schoolName}</h2>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide">Pauta de avaliação contínua</p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
        <p>Ano Lectivo: {academicYear}</p>
        <p>Classe: {meta.gradeName ?? "—"}</p>
        <p>Curso: {meta.courseName ?? "—"}</p>
        <p>Turma: {meta.className ?? "—"}</p>
        <p>Disciplina: {meta.subjectName ?? "—"}</p>
        <p>Trimestre: {meta.termLabel ?? "—"}</p>
      </div>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            {["Nº", "Nome do Aluno", "Proc.", "MAC", "NPP", "NPT", "Média", "Situação"].map((label) => (
              <th key={label} className="border border-black px-2 py-1 text-left">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.n}>
              <td className="border border-black px-2 py-1">{row.n}</td>
              <td className="border border-black px-2 py-1">{row.aluno}</td>
              <td className="border border-black px-2 py-1">{row.proc}</td>
              <td className="border border-black px-2 py-1 text-right">{row.mac}</td>
              <td className="border border-black px-2 py-1 text-right">{row.npp}</td>
              <td className="border border-black px-2 py-1 text-right">{row.npt}</td>
              <td className="border border-black px-2 py-1 text-right">{row.media}</td>
              <td className="border border-black px-2 py-1">{row.situacao}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {meta.validationCode ? (
        <p className="mt-4 text-right text-[11px] font-mono">Validar: {meta.validationCode}</p>
      ) : null}
      <div className="mt-10 grid grid-cols-3 gap-6 text-center text-sm">
        <p>O Professor: __________________</p>
        <p>O Coordenador: ________________</p>
        <p>A Direcção: ___________________</p>
      </div>
    </div>
  );
}

function CreateAssessmentDialog({
  open,
  onOpenChange,
  classGroupId,
  subjectId,
  term,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classGroupId?: string;
  subjectId?: string;
  term: 1 | 2 | 3;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("teste");
  const [component, setComponent] = useState("NPP");
  const [date, setDate] = useState("");
  const [maxScore, setMaxScore] = useState("20");
  const [description, setDescription] = useState("");
  const [counts, setCounts] = useState(true);
  const [recovery, setRecovery] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!classGroupId || !subjectId) {
      toast.error("Seleccione turma e disciplina.");
      return;
    }
    setSaving(true);
    try {
      await createAssessment({
        data: {
          classGroupId,
          subjectId,
          term,
          name,
          kind: kind as (typeof assessmentKinds)[number]["id"],
          component: component as (typeof assessmentComponents)[number]["id"],
          assessedOn: date || undefined,
          maxScore: Number(maxScore) || 20,
          description: description || undefined,
          countsTowardPauta: counts,
          allowRecovery: recovery,
        },
      });
      toast.success("Avaliação criada.");
      setName("");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumModal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Avaliação"
      title="Criar avaliação"
      description="A pauta calcula MAC, NPP e NPT a partir destas avaliações."
      icon={<Calculator className="size-5" />}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving || name.trim().length < 2}>
            {saving ? "A criar…" : "Criar avaliação"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="av-name">Nome</Label>
          <Input id="av-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label>Tipo</Label>
          <select
            className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {assessmentKinds.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Componente</Label>
          <select
            className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={component}
            onChange={(event) => setComponent(event.target.value)}
          >
            {assessmentComponents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="av-date">Data</Label>
          <Input id="av-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="av-max">Cotação</Label>
          <Input id="av-max" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="av-desc">Descrição</Label>
          <Input
            id="av-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={counts} onCheckedChange={setCounts} /> Conta para a pauta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={recovery} onCheckedChange={setRecovery} /> Permitir recuperação
        </label>
      </div>
    </PremiumModal>
  );
}
