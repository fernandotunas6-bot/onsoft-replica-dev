import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Copy,
  FileBadge,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  MessageSquare,
  Printer,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import type { PedagogicalWorkspace } from "@/features/academic/server";
import { exportCsv } from "@/lib/export-csv";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { whatsappHref } from "@/features/integrations/actions";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getSigaNavDocUrl } from "@/lib/ecosystem-urls";
import {
  inferTeachingCycle,
  subjectShortCode,
  getPeriodsForCycle,
  getPeriodNoun,
} from "@/lib/angola-academic";
import { useActiveAssessmentRule } from "@/features/academic/use-passing-value";
import {
  buildClassAcademicSummaries,
  type StudentAcademicSummary,
} from "@/features/academic/assessment-engine";
import {
  runAcademicConsistencyCheck,
  type ConsistencyCheckReport,
} from "@/features/academic/consistency-check";
import { MiniPautaView } from "./MiniPautaView";
import { FinalPautaView } from "./FinalPautaView";
import { TrimesterPautaView } from "./TrimesterPautaView";
import { ExamPautaView } from "./ExamPautaView";
import type {
  FinalPautaDocument,
  MiniPautaDocument,
  PautaMode,
  AngolaTeachingCycle,
  TrimesterPautaDocument,
  ExamPautaDocument,
} from "./types";
import {
  buildClassContext,
  buildFinalPautaStudents,
  buildMiniPautaStudents,
  buildSchoolIdentity,
  buildTrimesterPautaStudents,
  filterPautaStudents,
  isPassingStatus,
  toGender,
  type PautaStatusFilter,
} from "./pauta-documents";

interface PautasWorkspaceModuleProps {
  workspace?: PedagogicalWorkspace | null | undefined;
  onSelectClassGroup?: ((classGroupId: string) => void) | undefined;
}

export function PautasWorkspaceModule({
  workspace,
  onSelectClassGroup,
}: PautasWorkspaceModuleProps) {
  const {
    school: schoolSettings,
    activeYearLabel,
    selectedTerm: globalTerm,
    terms: academicTerms,
    setSelectedTermId,
  } = useSchoolSettings();
  const configuredPeriodCount = schoolSettings?.evaluation_periods;
  const [modelType, setModelType] = useState<PautaMode>("mini");
  const [selectedCycle, setSelectedCycle] = useState<AngolaTeachingCycle>("i_ciclo");
  // Nota de aprovação e regras de transição do modelo de avaliação em vigor.
  const activeRule = useActiveAssessmentRule();
  const promotionOptions = useMemo(
    () => ({ passing: activeRule.passing, rules: activeRule.promotionRules }),
    [activeRule.passing, activeRule.promotionRules],
  );
  const initialTerm =
    globalTerm?.sequence && globalTerm.sequence >= 1 && globalTerm.sequence <= 3
      ? globalTerm.sequence
      : 1;
  const [selectedTerm, setSelectedTerm] = useState<number>(initialTerm);
  // `?? []` cria um array novo a cada render, o que fazia todos os useMemo/
  // useEffect que dependem destas listas recalcularem sempre — memoização a
  // zero numa página pesada. Com useMemo a identidade só muda quando os dados
  // mudam de facto.
  const classGroups = useMemo(() => workspace?.classGroups ?? [], [workspace?.classGroups]);
  const enrollmentOptions = useMemo(
    () => workspace?.enrollmentOptions ?? [],
    [workspace?.enrollmentOptions],
  );
  const classSubjectNav = useMemo(() => workspace?.classSubjects ?? [], [workspace?.classSubjects]);
  const allTermGrades = useMemo(() => workspace?.termGrades ?? [], [workspace?.termGrades]);

  const [selectedClassId, setSelectedClassId] = useState<string>(() => classGroups[0]?.id ?? "");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<PautaStatusFilter>("all");

  // Mantém selectedClassId atualizado quando as turmas do workspace forem carregadas
  useEffect(() => {
    if (
      (!selectedClassId || !classGroups.some((cg) => cg.id === selectedClassId)) &&
      classGroups.length > 0
    ) {
      setSelectedClassId(classGroups[0].id);
    }
  }, [classGroups, selectedClassId]);

  // Sincroniza o trimestre da pauta com o período global da topbar.
  useEffect(() => {
    const sequence = globalTerm?.sequence;
    if (sequence && sequence >= 1 && sequence <= 3 && sequence !== selectedTerm) {
      setSelectedTerm(sequence);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à mudança do período global
  }, [globalTerm?.id, globalTerm?.sequence]);

  const applyTermSelection = (next: number) => {
    setSelectedTerm(next);
    const match = academicTerms.find((term) => term.sequence === next);
    if (match) setSelectedTermId(match.id);
  };

  const isRealClass = Boolean(selectedClassId && workspace);

  const currentClass = useMemo(
    () => classGroups.find((cg) => cg.id === selectedClassId),
    [classGroups, selectedClassId],
  );

  // Disciplinas realmente atribuídas a esta turma (não o catálogo inteiro da escola).
  const classSubjectsForSelected = useMemo(
    () => classSubjectNav.filter((cs) => cs.class_group_id === selectedClassId),
    [classSubjectNav, selectedClassId],
  );
  const realSubjectsForClass = useMemo(
    () => classSubjectsForSelected.map((cs) => ({ id: cs.subject_id, name: cs.subject_name })),
    [classSubjectsForSelected],
  );
  const enrollmentsForClass = useMemo(
    () => enrollmentOptions.filter((e) => e.class_group_id === selectedClassId),
    [enrollmentOptions, selectedClassId],
  );
  const genderByEnrollmentId = useMemo(
    () => new Map(enrollmentsForClass.map((e) => [e.id, toGender(e.student_gender)])),
    [enrollmentsForClass],
  );
  const termGradesForClass = useMemo(() => {
    const enrollmentIds = new Set(enrollmentsForClass.map((e) => e.id));
    return allTermGrades.filter((g) => enrollmentIds.has(g.enrollment_id));
  }, [allTermGrades, enrollmentsForClass]);

  const isRealClassEmpty = isRealClass && enrollmentsForClass.length === 0;

  // Ciclo por omissão a partir da classe/curso real; o dropdown continua a permitir override manual.
  useEffect(() => {
    if (isRealClass && currentClass) {
      setSelectedCycle(inferTeachingCycle(currentClass.grade_name, currentClass.course_name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

  const effectiveSubjectId = useMemo(() => {
    if (!isRealClass) return selectedSubjectId;
    if (realSubjectsForClass.some((s) => s.id === selectedSubjectId)) return selectedSubjectId;
    return realSubjectsForClass[0]?.id ?? "";
  }, [isRealClass, realSubjectsForClass, selectedSubjectId]);

  // Fonte única de médias/estado da turma: um único cálculo (Decreto 424/25) alimenta os quatro
  // modelos de pauta abaixo, em vez de cada um recalcular por si.
  const classSummaries: StudentAcademicSummary[] = useMemo(() => {
    if (!isRealClass) return [];
    return buildClassAcademicSummaries({
      enrollments: enrollmentsForClass.map((e) => ({
        id: e.id,
        student_name: e.student_name,
        registration_number: e.registration_number,
      })),
      subjects: realSubjectsForClass,
      termGrades: termGradesForClass.map((g) => ({
        id: g.id,
        enrollment_id: g.enrollment_id,
        subject_id: g.subject_id,
        term: g.term as 1 | 2 | 3,
        mac: g.mac,
        npp: g.npp,
        npt: g.npt,
      })),
      cycle: selectedCycle,
      options: promotionOptions,
    });
  }, [
    isRealClass,
    enrollmentsForClass,
    realSubjectsForClass,
    termGradesForClass,
    selectedCycle,
    promotionOptions,
  ]);

  const consistencyReport: ConsistencyCheckReport | null = useMemo(() => {
    if (!isRealClass || !currentClass) return null;
    return runAcademicConsistencyCheck({
      classGroupId: selectedClassId,
      classGroupName: currentClass.name,
      gradeName: currentClass.grade_name,
      enrollments: enrollmentsForClass.map((e) => ({
        id: e.id,
        student_name: e.student_name,
        status: "active",
      })),
      subjects: realSubjectsForClass,
      classSubjects: classSubjectsForSelected.map((cs) => ({
        subject_id: cs.subject_id,
        teacher_id: cs.teacher_id,
      })),
      termGrades: termGradesForClass.map((g) => ({
        enrollment_id: g.enrollment_id,
        subject_id: g.subject_id,
        term: g.term,
        mac: g.mac,
        npt: g.npt,
      })),
      term: selectedTerm,
    });
  }, [
    isRealClass,
    currentClass,
    selectedClassId,
    enrollmentsForClass,
    realSubjectsForClass,
    classSubjectsForSelected,
    termGradesForClass,
    selectedTerm,
  ]);

  // Verification code for document authenticity
  const validationCode = useMemo(
    () => documentValidationCode([`PAUTA-${modelType.toUpperCase()}`]),
    [modelType],
  );

  // Mini Pauta Document
  const rawMiniDocument: MiniPautaDocument = useMemo(() => {
    const subject = realSubjectsForClass.find((s) => s.id === effectiveSubjectId);
    const teacherName =
      classSubjectsForSelected.find((cs) => cs.subject_id === effectiveSubjectId)?.teacher_name ??
      "";

    const students = isRealClass
      ? buildMiniPautaStudents({
          summaries: classSummaries,
          subjectId: effectiveSubjectId,
          termGrades: termGradesForClass,
          genderByEnrollmentId,
        })
      : [];

    return {
      school: buildSchoolIdentity(schoolSettings),
      context: buildClassContext({
        currentClass,
        academicYear: activeYearLabel.replace(/^Ano Lectivo\s+/i, ""),
        cycle: selectedCycle,
        periodCount: configuredPeriodCount,
        teacherName,
        pautaNumber: `P-${currentClass?.name ?? "01"}`,
      }),
      subject: subject?.name ?? "Disciplina",
      students,
      signatures: { teacher: teacherName, pedagogicalDeputy: "", director: "" },
    };
  }, [
    isRealClass,
    selectedCycle,
    realSubjectsForClass,
    effectiveSubjectId,
    classSubjectsForSelected,
    classSummaries,
    termGradesForClass,
    genderByEnrollmentId,
    schoolSettings,
    currentClass,
    activeYearLabel,
    configuredPeriodCount,
  ]);

  // Trimester Pauta Document
  const rawTrimesterDocument: TrimesterPautaDocument = useMemo(() => {
    const students = isRealClass
      ? buildTrimesterPautaStudents({
          summaries: classSummaries,
          subjects: realSubjectsForClass,
          term: selectedTerm,
          cycle: selectedCycle,
          promotionOptions,
          genderByEnrollmentId,
        })
      : [];

    return {
      school: buildSchoolIdentity(schoolSettings),
      context: buildClassContext({
        currentClass,
        academicYear: activeYearLabel.replace(/^Ano Lectivo\s+/i, ""),
        cycle: selectedCycle,
        periodCount: configuredPeriodCount,
        pautaNumber: `PT-${currentClass?.name ?? "01"}`,
        term: selectedTerm,
      }),
      subjects: realSubjectsForClass.map((s) => ({
        id: s.id,
        name: s.name,
        shortName: subjectShortCode(s.name),
      })),
      students,
      signatures: { classCoordinator: "", pedagogicalDeputy: "", director: "" },
    };
  }, [
    isRealClass,
    selectedTerm,
    selectedCycle,
    classSummaries,
    realSubjectsForClass,
    genderByEnrollmentId,
    schoolSettings,
    currentClass,
    activeYearLabel,
    configuredPeriodCount,
    promotionOptions,
  ]);

  // Final Pauta Document
  const rawFinalDocument: FinalPautaDocument = useMemo(() => {
    const students = isRealClass
      ? buildFinalPautaStudents({ summaries: classSummaries, genderByEnrollmentId })
      : [];

    return {
      school: buildSchoolIdentity(schoolSettings),
      context: buildClassContext({
        currentClass,
        academicYear: activeYearLabel.replace(/^Ano Lectivo\s+/i, ""),
        cycle: selectedCycle,
        periodCount: configuredPeriodCount,
        pautaNumber: `PF-${currentClass?.name ?? "01"}`,
      }),
      subjects: realSubjectsForClass.map((s) => ({
        id: s.id,
        name: s.name,
        shortName: subjectShortCode(s.name),
      })),
      students,
      signatures: { jury: ["", "", ""], pedagogicalDeputy: "", director: "" },
    };
  }, [
    isRealClass,
    selectedCycle,
    classSummaries,
    realSubjectsForClass,
    genderByEnrollmentId,
    schoolSettings,
    currentClass,
    activeYearLabel,
    configuredPeriodCount,
  ]);

  // Exam Pauta Document
  const rawExamDocument: ExamPautaDocument = useMemo(() => {
    return {
      school: buildSchoolIdentity(schoolSettings),
      context: buildClassContext({
        currentClass,
        academicYear: activeYearLabel.replace(/^Ano Lectivo\s+/i, ""),
        cycle: selectedCycle,
        periodCount: configuredPeriodCount,
        pautaNumber: `PE-${currentClass?.name ?? "01"}`,
      }),
      isTechnical: selectedCycle === "tecnico",
      subject:
        selectedCycle === "tecnico"
          ? "Prova de Aptidão Profissional (PAP) & Estágio"
          : "Exame Nacional de Fim de Ciclo",
      students: [],
      signatures: { jury: ["", "", ""], pedagogicalDeputy: "", director: "" },
    };
  }, [selectedCycle, schoolSettings, currentClass, activeYearLabel, configuredPeriodCount]);

  // `useCallback` para que os quatro useMemo abaixo possam depender desta
  // função directamente, sem listar à mão o que ela fecha por dentro.
  const filterStudentList = useCallback(
    <T extends { name: string; code?: string; status?: string }>(list: T[]): T[] =>
      filterPautaStudents(list, searchQuery, statusFilter),
    [searchQuery, statusFilter],
  );

  const filteredMiniDocument = useMemo(
    () => ({ ...rawMiniDocument, students: filterStudentList(rawMiniDocument.students) }),
    [rawMiniDocument, filterStudentList],
  );
  const filteredTrimesterDocument = useMemo(
    () => ({ ...rawTrimesterDocument, students: filterStudentList(rawTrimesterDocument.students) }),
    [rawTrimesterDocument, filterStudentList],
  );
  const filteredFinalDocument = useMemo(
    () => ({ ...rawFinalDocument, students: filterStudentList(rawFinalDocument.students) }),
    [rawFinalDocument, filterStudentList],
  );
  const filteredExamDocument = useMemo(
    () => ({ ...rawExamDocument, students: filterStudentList(rawExamDocument.students) }),
    [rawExamDocument, filterStudentList],
  );

  // Active student list based on selected view mode
  const currentStudents = useMemo(() => {
    if (modelType === "mini") return filteredMiniDocument.students;
    if (modelType === "trimestre") return filteredTrimesterDocument.students;
    if (modelType === "final") return filteredFinalDocument.students;
    return filteredExamDocument.students;
  }, [
    modelType,
    filteredMiniDocument,
    filteredTrimesterDocument,
    filteredFinalDocument,
    filteredExamDocument,
  ]);

  const passCount = currentStudents.filter((s) => isPassingStatus(s.status)).length;
  const passRate =
    currentStudents.length > 0 ? Math.round((passCount / currentStudents.length) * 100) : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const rows = currentStudents.map((s) => ({
      number: s.number,
      code: s.code ?? "",
      name: s.name,
      status: s.status ?? "",
    }));
    const columns = [
      { label: "N.º", value: (row: (typeof rows)[number]) => row.number },
      { label: "Código", value: (row: (typeof rows)[number]) => row.code },
      { label: "Nome Completo", value: (row: (typeof rows)[number]) => row.name },
      { label: "Resultado", value: (row: (typeof rows)[number]) => row.status },
    ];
    exportCsv(`pauta-${modelType}-${selectedCycle}`, columns, rows);
    toast.success("Pauta exportada em ficheiro CSV.");
  };

  const handleCopyTsv = async () => {
    try {
      let tsvText = "N.º\tCódigo\tNome Completo\tResultado\n";
      currentStudents.forEach((s) => {
        tsvText += `${s.number}\t${s.code}\t${s.name}\t${s.status}\n`;
      });
      await navigator.clipboard.writeText(tsvText);
      toast.success("Grelha copiada para a área de transferência! Cole no Excel.");
    } catch {
      toast.error("Não foi possível copiar os dados.");
    }
  };

  const handleShareWhatsapp = () => {
    const text =
      `*RESUMO DA PAUTA SIGA* (${modelType.toUpperCase()})\n` +
      `Escola: ${rawMiniDocument.school.schoolName}\n` +
      `Turma: ${rawMiniDocument.context.classGroup} (${rawMiniDocument.context.className})\n` +
      `Total de Alunos: ${currentStudents.length}\n` +
      `Aprovados/Transitam: ${passCount} (${passRate}%)\n` +
      `Referência: ${validationCode}`;

    window.open(whatsappHref(text), "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="rounded-xl border border-border bg-card shadow-xs p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <FileBadge className="size-3.5" /> Decreto Executivo n.º 424/25
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                <CheckCircle2 className="size-3.5" /> Sistema Escolar Angolano
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" /> {validationCode}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Modelos de Pauta Escolar — Contextos de Ensino em Angola
            </h2>
            <p className="text-xs text-muted-foreground">
              Estruturas normativas para Ensino Primário, I Ciclo, II Ciclo / Liceu,
              Técnico-Profissional (PAP) e EJA / Adultos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="default" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="size-4" /> Imprimir / PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
              <FileSpreadsheet className="size-4" /> Exportar CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-success border-success/30"
              onClick={handleShareWhatsapp}
            >
              <MessageSquare className="size-4" /> Partilhar WhatsApp
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleCopyTsv}>
              <Copy className="size-3.5" /> Copiar Tabela
            </Button>
          </div>
        </div>

        {/* Quick Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Total de Alunos</p>
            <p className="text-lg font-bold text-foreground">{currentStudents.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Taxa de Transição</p>
            <p className="text-lg font-bold text-success">{passRate}%</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Aprovados / Transitam</p>
            <p className="text-lg font-bold text-foreground">{passCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Não Transitam / Retidos</p>
            <p className="text-lg font-bold text-destructive">
              {currentStudents.length - passCount}
            </p>
          </div>
        </div>

        {/* Search & Status Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-border print:hidden">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Pesquisar aluno"
              type="search"
              placeholder="Pesquisar por aluno ou código..."
              className="pl-9 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Filtrar:</span>
            <div className="flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                className={`px-2.5 py-1 rounded font-medium text-[11px] transition-all ${
                  statusFilter === "all"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
                onClick={() => setStatusFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded font-medium text-[11px] transition-all ${
                  statusFilter === "pass"
                    ? "bg-background text-success font-bold shadow-xs"
                    : "text-muted-foreground"
                }`}
                onClick={() => setStatusFilter("pass")}
              >
                Aprovados
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded font-medium text-[11px] transition-all ${
                  statusFilter === "fail"
                    ? "bg-background text-destructive font-bold shadow-xs"
                    : "text-muted-foreground"
                }`}
                onClick={() => setStatusFilter("fail")}
              >
                Não Transitam
              </button>
            </div>
          </div>
        </div>

        {/* Selectors Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:hidden pt-2">
          {/* Tipo / Âmbito de Pauta */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground block">
              Âmbito / Estrutura da Pauta
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-border p-1 bg-muted/40 gap-1">
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === "mini"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setModelType("mini")}
              >
                <FileText className="size-3 inline mr-1" /> Mini-Pauta
              </button>
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === "trimestre"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setModelType("trimestre")}
              >
                <Calendar className="size-3 inline mr-1" />{" "}
                {getPeriodNoun(selectedCycle) === "Semestre" ? "Semestral" : "Trimestral"}
              </button>
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === "final"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setModelType("final")}
              >
                <Layers className="size-3 inline mr-1" /> Pauta Final
              </button>
              <button
                type="button"
                className={`text-[11px] font-semibold py-1.5 px-2 rounded-md transition-all text-center ${
                  modelType === "exames"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setModelType("exames")}
              >
                <GraduationCap className="size-3 inline mr-1" /> Exames/PAP
              </button>
            </div>
          </div>

          {/* Nível de Ensino / Ciclo */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground block">
              Nível de Ensino
            </label>
            <select
              aria-label="Ciclo de ensino"
              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value as AngolaTeachingCycle)}
            >
              <option value="primario">Ensino Primário (1.ª–6.ª)</option>
              <option value="i_ciclo">I Ciclo Secundário (7.ª–9.ª)</option>
              <option value="ii_ciclo">II Ciclo / Liceu (10.ª–12.ª)</option>
              <option value="tecnico">Técnico-Profissional (PAP)</option>
              <option value="adultos">EJA / Adultos</option>
            </select>
          </div>

          {/* Seleção de Turma */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground block">Turma</label>
            <select
              aria-label="Turma"
              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                if (onSelectClassGroup) {
                  onSelectClassGroup(e.target.value);
                }
              }}
            >
              {classGroups.length === 0 && <option value="">Nenhuma turma disponível</option>}
              {classGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name} ({cg.grade_name || "Sem classe"})
                </option>
              ))}
            </select>
          </div>

          {/* Seleção de Disciplina / Trimestre */}
          {modelType === "mini" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground block">
                Disciplina
              </label>
              <select
                aria-label="Disciplina"
                className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
                value={effectiveSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
              >
                {realSubjectsForClass.length === 0 && (
                  <option value="">Sem disciplinas atribuídas</option>
                )}
                {realSubjectsForClass.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {modelType === "trimestre" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground block">
                {getPeriodNoun(selectedCycle)} Lectivo
              </label>
              <select
                aria-label="Trimestre"
                className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs focus:ring-2 focus:ring-primary font-medium"
                value={selectedTerm}
                onChange={(e) => applyTermSelection(Number(e.target.value))}
              >
                {getPeriodsForCycle(selectedCycle, configuredPeriodCount).map((p) => (
                  <option key={p} value={p}>
                    {p}.º {getPeriodNoun(selectedCycle)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Consistency Check Panel — só para turmas reais */}
      {isRealClass && consistencyReport && consistencyReport.issues.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-xs p-4 space-y-2 border-l-4 border-l-warning print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="size-4 text-warning" />
              Verificação de consistência — {consistencyReport.totalStudents} aluno(s),{" "}
              {consistencyReport.totalSubjects} disciplina(s)
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                consistencyReport.isReadyToLock
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
              }`}
            >
              {consistencyReport.isReadyToLock ? "Pronta para fechar" : "Pendências por resolver"}
            </span>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {consistencyReport.issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="flex items-start gap-1.5">
                <span className="mt-0.5 size-1.5 rounded-full bg-warning shrink-0" />
                {issue.message}
              </li>
            ))}
            {consistencyReport.issues.length > 8 && (
              <li className="text-[11px] italic">
                + {consistencyReport.issues.length - 8} outro(s) aviso(s).
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Empty state — nenhuma turma ou turma sem alunos matriculados */}
      {!currentClass || classGroups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-xs p-10 flex flex-col items-center justify-center text-center gap-3">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            Nenhuma turma selecionada ou configurada
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            Crie turmas e matricule alunos no ano lectivo activo para visualizar e exportar as
            pautas oficiais segundo o Decreto Executivo n.º 424/25.
          </p>
        </div>
      ) : isRealClassEmpty ? (
        <div className="rounded-xl border border-border bg-card shadow-xs p-10 flex flex-col items-center justify-center text-center gap-3">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            Esta turma ainda não tem alunos matriculados
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            Matricule alunos nesta turma para gerar a pauta oficial com os dados da instituição.
          </p>
        </div>
      ) : (
        <div className="w-full">
          {modelType === "mini" && <MiniPautaView data={filteredMiniDocument} />}
          {modelType === "trimestre" && <TrimesterPautaView data={filteredTrimesterDocument} />}
          {modelType === "final" && <FinalPautaView data={filteredFinalDocument} />}
          {modelType === "exames" &&
            (filteredExamDocument.students.length === 0 ? (
              <div className="rounded-xl border border-border bg-card shadow-xs p-10 flex flex-col items-center justify-center text-center gap-2">
                <GraduationCap className="size-8 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">
                  Sem dados de exame/PAP registados para esta turma
                </p>
                <p className="text-xs text-muted-foreground max-w-md">
                  O SIGA calcula e apresenta as pautas oficiais a partir das avaliações contínuas
                  (MAC/NPP/NPT). Para registar avaliações adicionais, consulte o Manual ou os Planos
                  de Aula.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to="/planos-aula">Abrir Planos de Aula</Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => window.open(getSigaNavDocUrl(), "_blank", "noopener,noreferrer")}
                  >
                    Manual DOC
                  </Button>
                </div>
              </div>
            ) : (
              <ExamPautaView data={filteredExamDocument} />
            ))}
        </div>
      )}
    </div>
  );
}
