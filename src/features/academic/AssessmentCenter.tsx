import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  ChevronDown,
  FileDown,
  FilePlus2,
  History,
  Lock,
  Pencil,
  Printer,
  Save,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SqlChecklistLink } from "@/components/ui/sql-checklist-link";
import { Switch } from "@/components/ui/switch";
import { QuickModal } from "@/components/ui/modal-system";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { AssessmentGrid, type GridColumn } from "@/features/academic/AssessmentGrid";
import {
  continuousComponent,
  recoveryResult,
  termAverageByRule,
} from "@/features/academic/assessment-model";
import { useActiveAssessmentRule } from "@/features/academic/use-passing-value";
import { cellKey, useGradeEditor } from "@/features/academic/use-grade-editor";
import { ClassCourseTable, StudentDossierTable } from "@/features/academic/AssessmentViewTables";
import { CreateAssessmentDialog } from "@/features/academic/CreateAssessmentDialog";
import {
  exportAssessmentDocument,
  toPautaExportRows,
  type AssessmentDocKind,
  type AssessmentDocType,
} from "@/features/academic/assessment-documents";
import {
  AssessmentBatchBar,
  AssessmentStudentDetail,
} from "@/features/academic/AssessmentGradeHelpers";
import {
  AssessmentExamTable,
  AssessmentItemsList,
  AssessmentRecoveryTable,
  AssessmentTermClosePanel,
} from "@/features/academic/AssessmentModeViews";
import {
  AssessmentDocumentsPanel,
  AssessmentFiltersPanel,
  AssessmentHistoryPanel,
} from "@/features/academic/AssessmentCenterPanels";
import { AssessmentStat, OfficialPautaView } from "@/features/academic/OfficialPautaView";
import {
  buildClassCourseMap,
  buildStudentDossier,
  buildTermCloseChecklist,
  changeHistoryLines,
  documentValidationCode,
  selectIdRange,
} from "@/features/academic/assessment-views";
import {
  listAssessments,
  upsertAssessmentScores,
  upsertTermGradesBatch,
} from "@/features/academic/server";
import { runAcademicConsistencyCheck } from "@/features/academic/consistency-check";
import { setTermLock } from "@/features/school/server";
import { usePersistedListFilters } from "@/lib/list-filters";
import {
  annualAverage,
  formatScore,
  getPeriodsForCycle,
  getPeriodNoun,
  inferTeachingCycle,
  parsePautaScore,
  recursoFinal,
  scoreAverage,
  situacaoPauta,
} from "@/lib/angola-academic";
import { AssessmentIntegrationActions } from "@/features/academic/AssessmentIntegrationActions";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { cn } from "@/lib/utils";

import {
  filterDefaults,
  scopes,
  workModes,
  type EnrollmentRow,
  type TermGradeRow,
  type ClassGroupOption,
  type ClassSubjectRow,
  type SubjectOption,
  type WorkMode,
  type ScopeId,
} from "@/features/academic/assessment-center-config";

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
  classSubjects,
  passingGrade,
  canLaunch,
  canLockTerm,
  closedTerms,
  evaluationPeriods,
  initialTerm,
  initialClassGroupId,
  initialSubjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolName: string;
  academicYear: string;
  directorName?: string | null | undefined;
  classGroups: ClassGroupOption[];
  subjects: SubjectOption[];
  enrollments: EnrollmentRow[];
  termGrades: TermGradeRow[];
  classSubjects?: ClassSubjectRow[] | undefined;
  passingGrade: number;
  canLaunch: boolean;
  canLockTerm: boolean;
  closedTerms: Array<1 | 2 | 3>;
  evaluationPeriods?: number | undefined;
  initialTerm?: string | undefined;
  initialClassGroupId?: string | undefined;
  initialSubjectId?: string | undefined;
}) {
  const queryClient = useQueryClient();
  // Pesos, arredondamento e escala do modelo activo: o ecrã calcula como a
  // pauta oficial. Sem modelo (Pedagógica avisa), fica o cálculo do Decreto
  // 424/25 e a escala 0–20.
  const { engine } = useActiveAssessmentRule();
  const parseScore = (value: string) => parsePautaScore(value, engine?.scale);
  const afterRecovery = (original: number | null, recovery: number | null) =>
    engine
      ? recoveryResult(original, recovery, engine.calculation.recoveryMethod)
      : recursoFinal(original, recovery);
  const { selectedTerm: globalTerm, terms: academicTerms, setSelectedTermId } = useSchoolSettings();
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
  const [autosave, setAutosave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialTerm && initialTerm !== "todos") setFilter("trimestre", initialTerm);
    else if (globalTerm?.sequence && globalTerm.sequence >= 1 && globalTerm.sequence <= 3) {
      setFilter("trimestre", String(globalTerm.sequence));
    }
    if (initialClassGroupId) setFilter("turma", initialClassGroupId);
    if (initialSubjectId) {
      setFilter("disciplina", initialSubjectId);
      setScope("disciplinas");
      setMode("lancamento");
    } else if (initialClassGroupId) {
      setScope("alunos");
      setMode("lancamento");
    }
  }, [globalTerm?.sequence, initialClassGroupId, initialSubjectId, initialTerm, open, setFilter]);

  const term = (Number(filters.trimestre) || 1) as 1 | 2 | 3;
  const termClosed = closedTerms.includes(term);
  const canEdit = canLaunch && !termClosed && mode !== "pauta";

  const selectedGroup =
    filters.turma !== "todas"
      ? (classGroups.find((group) => group.id === filters.turma) ?? null)
      : (classGroups[0] ?? null);
  const selectedCycle = inferTeachingCycle(selectedGroup?.grade_name, selectedGroup?.course_name);
  const periodOptions = getPeriodsForCycle(selectedCycle, evaluationPeriods);
  const periodNoun = getPeriodNoun(selectedCycle);

  // Topbar → Centro: quando o período global muda com o centro aberto.
  useEffect(() => {
    if (!open) return;
    const sequence = globalTerm?.sequence;
    if (!sequence || !periodOptions.includes(sequence as 1 | 2 | 3)) return;
    if (String(sequence) === filters.trimestre) return;
    setFilter("trimestre", String(sequence));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao período global
  }, [globalTerm?.id, globalTerm?.sequence, open, periodOptions]);

  // Centro → Topbar: o filtro de trimestre actualiza o período global.
  useEffect(() => {
    if (!open) return;
    const next = Number(filters.trimestre);
    if (!Number.isFinite(next) || next < 1 || next > 3) return;
    if (globalTerm?.sequence === next) return;
    const match = academicTerms.find((item) => item.sequence === next);
    if (match) setSelectedTermId(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evita loop com selectedTerm
  }, [filters.trimestre, open, academicTerms, setSelectedTermId]);

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
          String(row.registration_number ?? "")
            .toLowerCase()
            .includes(q)
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

  // useMemo para a identidade destas listas não mudar a cada render — sem
  // isto os useMemo/useEffect a jusante recalculavam sempre.
  const items = useMemo(() => assessmentsQuery.data?.items ?? [], [assessmentsQuery.data?.items]);
  const scores = useMemo(
    () => assessmentsQuery.data?.scores ?? [],
    [assessmentsQuery.data?.scores],
  );
  const assessmentsAvailable = assessmentsQuery.data?.available !== false;

  const { values, setValues, history, future, pushHistory, updateCell, undo, redo, dirtyKeys } =
    useGradeEditor({
      open,
      roster,
      termGrades,
      items,
      scores,
      classGroupId: selectedGroup?.id,
      subjectId: selectedSubject?.id,
      term,
    });

  // Antes, cada linha de aluno fazia cinco `items.filter(...)` — MAC, NPP, NPT,
  // recurso e exame. Numa turma de 40 com meia dúzia de itens são duzentos
  // varrimentos do array **a cada tecla digitada**, porque `computedRows` corria
  // sem memo. Agrupar uma vez troca esses varrimentos por consultas a um mapa.
  //
  // São dois mapas e não um: MAC/NPP/NPT só contam itens com
  // `counts_toward_pauta`, recurso e exame contam todos.
  const itensPorComponente = useMemo(() => {
    type Item = (typeof items)[number];
    const contam = new Map<string, Item[]>();
    const todos = new Map<string, Item[]>();
    for (const item of items) {
      const componente = String(item.component ?? "");
      if (!todos.has(componente)) todos.set(componente, []);
      todos.get(componente)!.push(item);
      if (item.counts_toward_pauta) {
        if (!contam.has(componente)) contam.set(componente, []);
        contam.get(componente)!.push(item);
      }
    }
    return { contam, todos };
  }, [items]);

  const computedRows = useMemo(() => {
    const notasDe = (
      mapa: Map<string, (typeof items)[number][]>,
      componente: string,
      row: Record<string, string>,
    ) => (mapa.get(componente) ?? []).map((item) => parseScore(row[String(item.id)] ?? ""));

    return roster.map((student) => {
      const row = values[student.id] ?? {};
      const fromItems = (component: string) => notasDe(itensPorComponente.contam, component, row);
      const mac =
        parseScore(row["mac"] ?? "") ??
        annualAverage(fromItems("MAC").filter((value) => value != null && !Number.isNaN(value)));
      const npp =
        parseScore(row["npp"] ?? "") ??
        annualAverage(fromItems("NPP").filter((value) => value != null && !Number.isNaN(value)));
      const npt =
        parseScore(row["npt"] ?? "") ??
        annualAverage(fromItems("NPT").filter((value) => value != null && !Number.isNaN(value)));
      const average =
        mac != null && npp != null && npt != null
          ? engine
            ? termAverageByRule(
                continuousComponent(mac, npp, engine.calculation.nppMode),
                npt,
                engine,
                engine.scale.decimalPlaces,
              )
            : scoreAverage(mac, npp, npt)
          : null;
      const recurso = annualAverage(
        notasDe(itensPorComponente.todos, "recurso", row).filter(
          (value): value is number => value != null && !Number.isNaN(value),
        ),
      );
      const exame = annualAverage(
        notasDe(itensPorComponente.todos, "exame", row).filter(
          (value): value is number => value != null && !Number.isNaN(value),
        ),
      );
      const finalScore = exame ?? afterRecovery(average, recurso);
      const situacao =
        finalScore == null
          ? { label: "Pendente", tone: "muted" as const }
          : situacaoPauta(finalScore, passingGrade);
      return { student, mac, npp, npt, average, recurso, exame, finalScore, situacao, row };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parseScore deriva de engine
  }, [roster, values, itensPorComponente, passingGrade, engine]);

  const visibleRows = useMemo(
    () =>
      computedRows.filter((entry) => {
        if (mode === "revisao") {
          const dirty = ["mac", "npp", "npt"].some((key) =>
            dirtyKeys.has(cellKey(entry.student.id, key)),
          );
          return entry.average == null || dirty;
        }
        if (filters.situacao === "todos") return true;
        if (filters.situacao === "pendente") return entry.average == null;
        if (filters.situacao === "completo") return entry.average != null;
        if (filters.situacao === "transita") return entry.situacao.label === "Transita";
        if (filters.situacao === "nao_transita") return entry.situacao.label === "Não transita";
        if (filters.situacao === "em_recurso") return entry.recurso != null;
        if (filters.situacao === "aprovado")
          return (entry.exame ?? entry.finalScore ?? 0) >= passingGrade;
        if (filters.situacao === "reprovado")
          return entry.finalScore != null && entry.finalScore < passingGrade;
        return true;
      }),
    [computedRows, mode, dirtyKeys, filters.situacao, passingGrade],
  );

  const selectedStudent = visibleRows.find((row) => row.student.id === selectedId) ?? null;
  const contextLabel = [
    selectedGroup?.grade_name,
    selectedGroup?.name,
    selectedSubject?.name,
    `${term}º ${periodNoun.toLowerCase()}`,
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

  // Os dois corriam a cada render — logo, a cada tecla — e nenhum depende do
  // que se está a digitar: o dossier é do aluno seleccionado, o mapa é das
  // turmas filtradas.
  const dossier = useMemo(
    () =>
      selectedStudent
        ? buildStudentDossier(termGrades, subjects, selectedStudent.student.id, passingGrade)
        : [],
    [selectedStudent, termGrades, subjects, passingGrade],
  );
  const classMap = useMemo(
    () =>
      buildClassCourseMap(
        classGroups.filter((group) => {
          if (filters.classe !== "todas" && group.grade_name !== filters.classe) return false;
          if (filters.curso !== "todos" && group.course_name !== filters.curso) return false;
          return true;
        }),
        enrollments,
        termGrades,
        passingGrade,
      ),
    [classGroups, filters.classe, filters.curso, enrollments, termGrades, passingGrade],
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
        return value.trim() !== "" && Number.isNaN(parseScore(value));
      }).length
    );
  }, 0);
  const toggleTermLock = () =>
    void setTermLock({ data: { term, closed: !termClosed } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["school", "settings"] }),
    );

  const closeChecklist = buildTermCloseChecklist({
    total: visibleRows.length,
    pending: pendingCount,
    dirty: dirtyCount,
    invalid: invalidCount,
    closed: termClosed,
  });

  // Verificação de consistência por turma (academic/consistency-check.ts) — o fecho de trimestre
  // continua a ser por escola+trimestre (não há ainda bloqueio por turma), mas só se habilita
  // quando NENHUMA turma tem docentes por atribuir ou notas pendentes nesse trimestre.
  const termReadiness = useMemo(() => {
    const reports = classGroups.map((group) =>
      runAcademicConsistencyCheck({
        classGroupId: group.id,
        classGroupName: group.name,
        gradeName: group.grade_name,
        enrollments: enrollments
          .filter((e) => e.class_group_id === group.id)
          .map((e) => ({ id: e.id, student_name: e.student_name, status: "active" })),
        subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
        classSubjects: (classSubjects ?? []).filter((cs) => cs.class_group_id === group.id),
        termGrades: termGrades.map((g) => ({
          enrollment_id: g.enrollment_id,
          subject_id: g.subject_id,
          term: g.term,
          mac: g.mac,
          npt: g.npt,
        })),
        term,
      }),
    );
    const notReady = reports.filter((report) => report.totalStudents > 0 && !report.isReadyToLock);
    return { reports, notReady, allReady: notReady.length === 0 };
  }, [classGroups, subjects, enrollments, termGrades, classSubjects, term]);
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
            score: parseScore(entry.row[String(item.id)] ?? ""),
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
    // `saveChanges` é recriada a cada render: incluí-la reiniciaria o debounce
    // a cada tecla e o autosave nunca chegaria a disparar. Estas três são o
    // gatilho pretendido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, canEdit, dirtyCount]);

  const officialRows = toPautaExportRows(visibleRows);

  const officialMeta = {
    schoolName,
    academicYear,
    ...(selectedGroup?.grade_name ? { gradeName: selectedGroup.grade_name } : {}),
    ...(selectedGroup?.course_name ? { courseName: selectedGroup.course_name } : {}),
    ...(selectedGroup?.name ? { className: selectedGroup.name } : {}),
    ...(selectedSubject?.name ? { subjectName: selectedSubject.name } : {}),
    termLabel: `${term}º ${periodNoun.toLowerCase()}`,
    ...(directorName ? { directorName } : {}),
    validationCode,
  };

  const exportDocument = (kind: AssessmentDocKind, docType: AssessmentDocType = "pauta") =>
    exportAssessmentDocument(
      {
        contextKind,
        group: selectedGroup,
        subjectName: selectedSubject?.name,
        school: { name: schoolName, directorName: directorName ?? undefined, academicYear },
        meta: officialMeta,
        rows: officialRows,
        classMap,
        dossier,
        student: selectedStudent,
        validationCode,
      },
      kind,
      docType,
    );

  const applyBatch = () => {
    const parsed = parseScore(batchValue);
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
      toast.error(`Não há notas do ${periodNoun.toLowerCase()} anterior nesta disciplina.`);
      return;
    }
    setValues((current) => {
      pushHistory(current);
      const next = { ...current };
      for (const { id, grade } of previous) {
        next[id] = {
          ...(next[id] ?? {}),
          mac: grade.mac != null ? String(grade.mac) : "",
          npp: grade.npp != null ? String(grade.npp) : "",
          npt: grade.npt != null ? String(grade.npt) : "",
        };
      }
      return next;
    });
    toast.success(
      `Copiámos ${previous.length} aluno(s) do ${term - 1}º ${periodNoun.toLowerCase()}. Revise e guarde.`,
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
          mac: cells[0] ?? next[entry.student.id]?.["mac"] ?? "",
          npp: cells[1] ?? next[entry.student.id]?.["npp"] ?? "",
          npt: cells[2] ?? next[entry.student.id]?.["npt"] ?? "",
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
    // `undo`/`redo`/`fillDown` são recriadas a cada render: incluí-las voltaria
    // a registar o listener de teclado em cada render. O atalho só precisa de
    // ser (re)ligado quando o painel abre ou fecha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const classes = Array.from(new Set(classGroups.map((group) => group.grade_name).filter(Boolean)));
  const courses = Array.from(
    new Set(classGroups.map((group) => group.course_name).filter(Boolean)),
  );

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (!confirmDiscardChanges(dirtyCount > 0)) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[96vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="flex items-center justify-between border-b px-5 py-3 print:hidden">
          <div>
            <DialogTitle className="font-display text-xl font-extrabold">{schoolName}</DialogTitle>
            <DialogDescription className="sr-only">
              Grelha de lançamento de notas e geração de pautas oficiais.
            </DialogDescription>
          </div>
          <p className="text-xs text-muted-foreground">{academicYear}</p>
        </div>

        <div className="border-b px-5 py-2 text-sm print:hidden">
          <span className="text-xs font-bold text-muted-foreground">Contexto</span>
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
                mode === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
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
          <AssessmentFiltersPanel
            filters={filters}
            setFilter={setFilter}
            resetFilters={resetFilters}
            activeCount={activeCount}
            classes={classes}
            courses={courses}
            classGroups={classGroups}
            subjects={subjects}
            periodNoun={periodNoun}
            periodOptions={periodOptions}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2 print:hidden">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCreateOpen(true)}
            disabled={!canEdit}
          >
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
            Copiar {periodNoun.toLowerCase()} anterior
          </Button>
          <Button size="sm" variant="outline" onClick={undo} disabled={!history.length}>
            Desfazer
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={!future.length}>
            Refazer
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setDocsOpen((value) => !value)}
          >
            <FileDown className="size-3.5" /> Documentos
          </Button>
          <AssessmentIntegrationActions
            schoolName={schoolName}
            academicYear={academicYear}
            term={term}
            groupName={selectedGroup?.name ?? "turma"}
            workCount={checkedIds.size || enrollments.length}
          />
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
              disabled={!termClosed && (!closeChecklist.ready || !termReadiness.allReady)}
              title={
                !termClosed && !termReadiness.allReady
                  ? `${termReadiness.notReady.length} turma(s) com pendências neste trimestre.`
                  : undefined
              }
              onClick={toggleTermLock}
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
          <AssessmentDocumentsPanel
            contextKind={contextKind}
            hasSelectedStudent={Boolean(selectedStudent)}
            exportDocument={exportDocument}
          />
        ) : null}

        {historyOpen ? <AssessmentHistoryPanel lines={historyLines} /> : null}

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
              <AssessmentStat label="Alunos" value={String(visibleRows.length)} />
              <AssessmentStat label="Pendentes" value={String(pendingCount)} />
              <AssessmentStat label="Média da turma" value={formatScore(classAverage)} />
              <AssessmentStat
                label="Transitam"
                value={String(
                  visibleRows.filter((row) => row.situacao.label === "Transita").length,
                )}
              />
            </div>
          ) : mode === "avaliacoes" ? (
            <AssessmentItemsList available={assessmentsAvailable} items={items} />
          ) : mode === "recursos" ? (
            <AssessmentRecoveryTable
              rows={visibleRows}
              subjectName={selectedSubject?.name ?? "—"}
              afterRecovery={afterRecovery}
            />
          ) : mode === "exames" ? (
            <AssessmentExamTable
              rows={visibleRows}
              subjectName={selectedSubject?.name ?? "—"}
              passingGrade={passingGrade}
            />
          ) : mode === "fecho" ? (
            <AssessmentTermClosePanel
              termClosed={termClosed}
              checklist={closeChecklist}
              readiness={termReadiness}
              canLockTerm={canLockTerm}
              onToggleLock={toggleTermLock}
            />
          ) : (
            <>
              {canEdit && checkedIds.size > 0 ? (
                <AssessmentBatchBar
                  selectedRows={visibleRows.filter((row) => checkedIds.has(row.student.id))}
                  field={batchField}
                  onFieldChange={setBatchField}
                  value={batchValue}
                  onValueChange={setBatchValue}
                  onApply={applyBatch}
                />
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
            <AssessmentStudentDetail
              studentName={selectedStudent.student.student_name}
              items={items}
              row={selectedStudent.row}
              average={selectedStudent.average}
            />
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
            <Button
              className="gap-1.5"
              disabled={!canEdit || dirtyCount === 0 || saving}
              onClick={() => setSaveOpen(true)}
            >
              <Save className="size-3.5" /> Guardar
            </Button>
          </div>
        </div>

        <QuickModal
          open={saveOpen}
          onOpenChange={setSaveOpen}
          title="Guardar alterações"
          subtitle={contextLabel}
          submitLabel={
            saving
              ? "A guardar…"
              : contextKind === "aluno"
                ? "Guardar avaliação do aluno"
                : contextKind === "disciplina"
                  ? "Guardar pauta da disciplina"
                  : "Guardar pauta da turma"
          }
          isSubmitting={saving}
          onSubmit={async () => {
            await saveChanges();
          }}
          extraActions={
            <>
              <Button variant="outline" size="sm" onClick={() => exportDocument("pdf")}>
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportDocument("excel")}>
                Excel
              </Button>
            </>
          }
        >
          <p className="text-xs text-muted-foreground">
            {visibleRows.length} alunos · {dirtyCount} alterações neste contexto.
          </p>
        </QuickModal>

        <CreateAssessmentDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          classGroupId={selectedGroup?.id}
          subjectId={selectedSubject?.id}
          term={term}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["academic", "assessments"] })}
        />
      </DialogContent>
    </Dialog>
  );
}
