import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Download,
  FileDown,
  FileUp,
  Award,
  Plus,
  Sparkles,
  ShieldAlert,
  ChevronDown,
} from "lucide-react";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { meetingRoomLink } from "@/features/integrations/actions";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { ClassGroupSheet } from "@/features/academic/ClassGroupSheet";
import { TurmaProfileModal } from "@/features/academic/components/TurmaProfileModal";
import { GradePautaSheet } from "@/features/academic/GradePautaSheet";
import { ScheduleWorkspace } from "@/features/academic/schedule/ScheduleWorkspace";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import {
  createAdvancedScheduleSlot,
  deleteScheduleSlot,
  updateAdvancedScheduleSlot,
  publishAcademicSchedule,
  ensureAcademicDefaults,
  listPedagogicalWorkspace,
  listRooms,
  listSubjectTypes,
  listCurriculumAreas,
  upsertTermGrade,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import { listTeachers } from "@/features/people/server";
import { UserAvatar } from "@/components/ui/user-avatar";
import { gradeMatchesTeachingLevels, initialsFromName } from "@/lib/angola-academic";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canWriteModule } from "@/features/auth/access-policy";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { cn } from "@/lib/utils";
import { exportCsv } from "@/lib/export-csv";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import { usePersistedListFilters } from "@/lib/list-filters";
import { DropoutRiskReportModal } from "@/features/pedagogica/components/DropoutRiskReportModal";
import { PautasWorkspaceModule } from "@/features/pedagogica/components/pautas/PautasWorkspaceModule";
import { AttendanceWorkspaceModule } from "@/features/pedagogica/components/AttendanceWorkspaceModule";
import { TurmasWorkspaceTab } from "@/features/pedagogica/components/TurmasWorkspaceTab";
import { DisciplinasWorkspaceTab } from "@/features/pedagogica/components/DisciplinasWorkspaceTab";
import { SalasWorkspaceTab } from "@/features/pedagogica/components/SalasWorkspaceTab";
import { CurriculoWorkspaceTab } from "@/features/pedagogica/components/CurriculoWorkspaceTab";
import { SchoolNowWidget } from "@/features/academic/components/SchoolNowWidget";
import { getSigaNavDocUrl } from "@/lib/ecosystem-urls";
import { toast } from "sonner";
import { warmPedagogicaCharts } from "@/lib/warm-charts";

const PedagogicaNotasCharts = lazy(() =>
  import("@/features/academic/PedagogicaNotasCharts").then((module) => ({
    default: module.PedagogicaNotasCharts,
  })),
);

const AssessmentCenter = lazy(() =>
  import("@/features/academic/AssessmentCenter").then((module) => ({
    default: module.AssessmentCenter,
  })),
);

const pedagogicaSearchSchema = z
  .object({
    tab: z
      .enum([
        "turmas",
        "disciplinas",
        "salas",
        "curriculo",
        "notas",
        "horarios",
        "presencas",
        "chamada",
        "pautas",
      ])
      .optional(),
    turma: z.string().uuid().optional(),
    disciplina: z.string().uuid().optional(),
    pauta: z.enum(["1"]).optional(),
    dia: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .passthrough();

const pedagogicaFilterDefaults = {
  q: "",
  turno: "todos",
  programa: "todos",
  trimestre: "todos",
  estado: "todos",
  lotacao: "todas",
};

type PedagogicaTab = NonNullable<z.infer<typeof pedagogicaSearchSchema>["tab"]>;

export const Route = createFileRoute("/pedagogica")({
  validateSearch: pedagogicaSearchSchema,
  head: () => ({
    meta: [
      { title: "Área Pedagógica · SIGA" },
      {
        name: "description",
        content:
          "Turmas, disciplinas, lançamento de notas por trimestre e horários semanais da escola num só painel pedagógico.",
      },
      { property: "og:title", content: "Área Pedagógica · SIGA" },
      {
        property: "og:description",
        content: "Gestão de turmas, disciplinas, notas trimestrais e horários escolares.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PedagogicaPage,
});

const shiftLabels = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
} as const;

function optionLabel(id: string, label: string) {
  return `${label} · ${id.slice(0, 8)}`;
}

function resolveOptionId(options: string[], selected: string | undefined, ids: string[]) {
  const index = options.indexOf(selected ?? "");
  return index >= 0 ? ids[index] : undefined;
}

function PedagogicaPage() {
  const navigate = useNavigate({ from: "/pedagogica" });
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const installed = useInstalledIntegrations();
  const zoomOn = installed.hasCapability("zoom.rooms");
  const teamsOn = installed.hasCapability("teams.meetings");
  const classroomOn = installed.hasCapability("classroom.classes");
  const classroomWork = installed.hasCapability("classroom.work");
  const moodleOn = installed.hasCapability("moodle.courses");
  const moodleGrades = installed.hasCapability("moodle.grades");
  const canvasOn = installed.hasCapability("canvas.courses");
  const canvasWork = installed.hasCapability("canvas.assignments");
  const teamsClasses = installed.hasCapability("teams.classes");
  const onedriveOn = installed.hasCapability("m365.onedrive");
  const { activeYearLabel, selectedYearId, school } = useSchoolSettings();
  const {
    tab: tabFromSearch,
    turma: turmaFromSearch,
    disciplina: disciplinaFromSearch,
    pauta,
    dia: diaFromSearch,
  } = Route.useSearch();
  const [tab, setTab] = useState<PedagogicaTab>(tabFromSearch ?? "turmas");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [openTurmaId, setOpenTurmaId] = useState<string | null>(null);
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "pedagogica",
    pedagogicaFilterDefaults,
  );

  const canManageAcademic = canWriteModule(account.role, "pedagogica");
  const canLaunchGrades = canManageAcademic || account.role === "Professor";
  const canReadAcademic =
    account.role === "Administrador" ||
    account.role === "Secretaria" ||
    account.role === "Professor";
  const teachingLevels = useMemo(
    () => school?.pedagogy?.teachingLevels ?? [],
    [school?.pedagogy?.teachingLevels],
  );

  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: canReadAcademic,
    retry: false,
  });
  const teachersQuery = useQuery({
    queryKey: ["people", "teachers", "assign"],
    queryFn: () => listTeachers({ data: { status: "active", limit: 200 } }),
    enabled: canManageAcademic,
  });
  const classroomsQuery = useQuery({
    queryKey: ["academic", "rooms"],
    queryFn: () => listRooms(),
    enabled: canReadAcademic,
  });
  const subjectTypesQuery = useQuery({
    queryKey: ["academic", "subject-types"],
    queryFn: () => listSubjectTypes(),
    enabled: canReadAcademic,
  });
  const curriculumAreasQuery = useQuery({
    queryKey: ["academic", "curriculum-areas"],
    queryFn: () => listCurriculumAreas(),
    enabled: canReadAcademic,
  });

  useEffect(() => {
    if (tabFromSearch) setTab(tabFromSearch);
  }, [tabFromSearch]);

  useEffect(() => {
    if (tab === "notas") warmPedagogicaCharts();
  }, [tab]);

  useEffect(() => {
    if (pauta === "1") setAssessmentOpen(true);
  }, [pauta, turmaFromSearch, disciplinaFromSearch]);

  const onTabChange = (next: string) => {
    if (
      !(
        [
          "turmas",
          "disciplinas",
          "salas",
          "curriculo",
          "notas",
          "horarios",
          "presencas",
          "chamada",
          "pautas",
        ] as const
      ).includes(next as PedagogicaTab)
    ) {
      return;
    }
    const nextTab = next as PedagogicaTab;
    setTab(nextTab);
    void navigate({
      search: (prev) => ({
        ...prev,
        tab: nextTab,
      }),
      replace: true,
    });
  };

  const workspace = workspaceQuery.data;
  const classGroups = useMemo(() => workspace?.classGroups ?? [], [workspace?.classGroups]);
  const academicYears = workspace?.academicYears ?? [];
  const courses = workspace?.courses ?? [];
  const gradeLevels = workspace?.gradeLevels ?? [];
  const rooms = workspace?.rooms ?? [];
  const classrooms = classroomsQuery.data ?? [];
  const subjects = workspace?.subjects ?? [];
  const termGrades = useMemo(() => workspace?.termGrades ?? [], [workspace?.termGrades]);
  const enrollmentOptions = workspace?.enrollmentOptions ?? [];
  const classSubjects = workspace?.classSubjects ?? [];
  const scheduleSlots = workspace?.scheduleSlots ?? [];
  const subjectsAvailable = workspace?.subjectsAvailable !== false;
  const gradesAvailable = workspace?.gradesAvailable !== false;
  const scheduleAvailable = workspace?.scheduleAvailable !== false;

  const visibleGradeLevels = gradeLevels.filter((grade) =>
    gradeMatchesTeachingLevels(String(grade.name ?? ""), teachingLevels),
  );
  const yearOptions = academicYears.map((year) => optionLabel(year.id, year.name));
  const gradeOptions = visibleGradeLevels.map((grade) => optionLabel(grade.id, grade.name));
  const roomOptions = ["Sem sala", ...rooms.map((room) => optionLabel(room.id, room.name))];
  const subjectOptions = subjects.map((subject) => optionLabel(subject.id, subject.name));
  const teachers = teachersQuery.data ?? [];
  const teacherOptions = teachers.map((teacher) => optionLabel(teacher.id, teacher.full_name));
  const turmaAssignOptions = classGroups.map((group) => optionLabel(group.id, group.name));
  const teacherNameById = new Map(teachers.map((teacher) => [teacher.id, teacher.full_name]));
  const refreshAcademic = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["academic", "teacher-workspace"] }),
    ]).then(() => undefined);
  const enrollmentSelectOptions = enrollmentOptions.map((enrollment) =>
    optionLabel(enrollment.id, enrollment.label),
  );
  const structureReady = academicYears.length > 0 && courses.length > 0 && gradeLevels.length > 0;

  const mediaNotas =
    termGrades.length > 0
      ? termGrades.reduce((sum, nota) => sum + nota.average, 0) / termGrades.length
      : 0;
  const assiduidadeMedia =
    classGroups.length > 0
      ? classGroups.reduce((sum, group) => sum + (group.attendance_rate ?? 0), 0) /
        classGroups.filter((group) => group.attendance_rate != null).length
      : 0;
  const assiduidadeSafe = Number.isFinite(assiduidadeMedia) ? assiduidadeMedia : 0;
  const aproveitamento = termGrades.filter((nota) => nota.average >= 10).length;
  const taxaAproveitamento =
    termGrades.length > 0 ? Math.round((aproveitamento / termGrades.length) * 100) : 0;

  const turmasComDados = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return classGroups
      .map((turma) => {
        const capacidade = turma.capacity ?? Math.max(turma.enrolled_count, 1);
        return {
          id: turma.id,
          code: turma.code,
          nome: turma.name,
          curso: turma.course_name,
          sala: turma.room_name,
          shift: String(turma.shift ?? ""),
          turno: shiftLabels[turma.shift as keyof typeof shiftLabels] ?? turma.shift,
          director: "—",
          alunosActuais: turma.enrolled_count,
          capacidadeReal: capacidade,
          mediaReal: turma.average_score ?? 0,
          ano: turma.academic_year_name,
          classe: turma.grade_name,
          status: turma.status,
          campusId: turma.campus_id as string | null,
          capacity: turma.capacity as number | null,
          whatsappInviteUrl: String(turma.whatsapp_invite_url ?? ""),
          whatsappGroupName: String(turma.whatsapp_group_name ?? ""),
        };
      })
      .filter((turma) => {
        const matchQ =
          !q ||
          turma.nome.toLowerCase().includes(q) ||
          turma.curso.toLowerCase().includes(q) ||
          turma.classe.toLowerCase().includes(q);
        const matchTurno = filters.turno === "todos" || turma.turno === filters.turno;
        const matchPrograma = filters.programa === "todos" || turma.curso === filters.programa;
        const matchEstado =
          filters.estado === "todos" ||
          (filters.estado === "activas" && turma.status === "active") ||
          (filters.estado === "inactivas" && turma.status !== "active");
        const ocupacao = turma.capacidadeReal > 0 ? turma.alunosActuais / turma.capacidadeReal : 0;
        const matchLotacao =
          filters.lotacao === "todas" ||
          (filters.lotacao === "vagas" && ocupacao < 1) ||
          (filters.lotacao === "completas" && ocupacao >= 1);
        const matchNivel = gradeMatchesTeachingLevels(turma.classe, teachingLevels);
        return matchQ && matchTurno && matchPrograma && matchEstado && matchLotacao && matchNivel;
      });
  }, [
    classGroups,
    filters.estado,
    filters.lotacao,
    filters.programa,
    filters.q,
    filters.turno,
    teachingLevels,
  ]);

  const notasFiltradas = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return termGrades.filter((nota) => {
      const matchQ =
        !q ||
        nota.student_name.toLowerCase().includes(q) ||
        nota.class_group_name.toLowerCase().includes(q) ||
        nota.subject_name.toLowerCase().includes(q);
      const matchTrimestre =
        filters.trimestre === "todos" || String(nota.term) === filters.trimestre;
      const matchPrograma =
        filters.programa === "todos" ||
        turmasComDados.some(
          (turma) => turma.nome === nota.class_group_name && turma.curso === filters.programa,
        ) ||
        classGroups.some(
          (group) => group.name === nota.class_group_name && group.course_name === filters.programa,
        );
      return matchQ && matchTrimestre && matchPrograma;
    });
  }, [classGroups, filters.programa, filters.q, filters.trimestre, termGrades, turmasComDados]);

  const aproveitamentoPorClasse = Array.from(
    termGrades
      .reduce((map, nota) => {
        const classe = nota.class_group_name.split(" ")[0] ?? nota.class_group_name;
        const current = map.get(classe) ?? { classe, aprovados: 0, reprovados: 0 };
        if (nota.average >= 10) current.aprovados += 1;
        else current.reprovados += 1;
        map.set(classe, current);
        return map;
      }, new Map<string, { classe: string; aprovados: number; reprovados: number }>())
      .values(),
  ).sort((a, b) => Number.parseInt(a.classe, 10) - Number.parseInt(b.classe, 10));

  const mediaPorTrimestre = [1, 2, 3].map((term) => {
    const notasTrimestre = termGrades.filter((nota) => nota.term === term);
    const base = notasTrimestre.length
      ? notasTrimestre.reduce((sum, nota) => sum + nota.average, 0) / notasTrimestre.length
      : 0;
    return { trimestre: `${term}º`, media: Number(base.toFixed(1)) };
  });

  const pautaColumns = [
    { label: "Aluno", value: (row: Record<string, string | number>) => row["aluno"] },
    { label: "Turma", value: (row: Record<string, string | number>) => row["turma"] },
    { label: "Disciplina", value: (row: Record<string, string | number>) => row["disciplina"] },
    { label: "Trimestre", value: (row: Record<string, string | number>) => row["trimestre"] },
    { label: "MAC", value: (row: Record<string, string | number>) => row["mac"] },
    { label: "NPP", value: (row: Record<string, string | number>) => row["npp"] },
    { label: "NPT", value: (row: Record<string, string | number>) => row["npt"] },
    { label: "Média", value: (row: Record<string, string | number>) => row["media"] },
  ] as const;

  const pautaRows = notasFiltradas.map((nota) => ({
    aluno: nota.student_name,
    turma: nota.class_group_name,
    disciplina: nota.subject_name,
    trimestre: nota.term_label,
    mac: nota.mac,
    npp: nota.npp,
    npt: nota.npt,
    media: Number(nota.average.toFixed(1)),
  }));

  const exportarPautaCsv = () =>
    exportCsv("pauta-trimestral-filtrada", [...pautaColumns], pautaRows);
  const exportarPautaPdf = () =>
    exportPdfTable(
      "pauta-trimestral-filtrada",
      "Pauta trimestral",
      [...pautaColumns],
      pautaRows,
      `Filtros activos: ${activeCount || "nenhum"} · ${activeYearLabel}`,
    );
  const exportarPautaOficial = () => {
    const academicYear =
      activeYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "";
    void issuePrintDocument({
      tipo: "Pauta trimestral (lista)",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif,
        phone: school?.phone,
        email: school?.email,
        address: school?.address,
        directorName: school?.director_name,
        academicYear,
      },
      overlay: overlayServico({
        name: "Pauta trimestral",
        areaLabel: "Pedagógica",
        reference: `PAU-${pautaRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Notas filtradas",
            rows: pautaRows.map((row) => ({
              label: `${row.aluno} · ${row.disciplina}`,
              value: `${row.trimestre}: ${row.media}`,
              note: `${row.turma} · MAC ${row.mac} · NPP ${row.npp} · NPT ${row.npt}`,
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "pauta-trimestral-oficial",
          "Pauta trimestral",
          {
            schoolName: school?.name ?? "Escola",
            academicYear,
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              activeYearLabel,
              String(pautaRows.length),
            ]),
          },
          [...pautaColumns],
          pautaRows,
        ),
    });
  };

  const turmaExportColumns = [
    { label: "Código", value: (row: (typeof turmasComDados)[number]) => String(row.code ?? "") },
    { label: "Turma", value: (row: (typeof turmasComDados)[number]) => String(row.nome ?? "") },
    { label: "Programa", value: (row: (typeof turmasComDados)[number]) => String(row.curso ?? "") },
    { label: "Classe", value: (row: (typeof turmasComDados)[number]) => String(row.classe ?? "") },
    { label: "Turno", value: (row: (typeof turmasComDados)[number]) => String(row.turno ?? "") },
    {
      label: "Alunos",
      value: (row: (typeof turmasComDados)[number]) => String(row.alunosActuais ?? ""),
    },
    { label: "Estado", value: (row: (typeof turmasComDados)[number]) => String(row.status ?? "") },
  ] as const;
  const exportarTurmasCsv = () =>
    exportCsv("turmas-filtradas", [...turmaExportColumns], turmasComDados);
  const exportarTurmasOficial = () => {
    void issuePrintDocument({
      tipo: "Lista de turmas",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif,
        phone: school?.phone,
        email: school?.email,
        address: school?.address,
        directorName: school?.director_name,
        academicYear: activeYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
      },
      overlay: overlayServico({
        name: "Lista de turmas",
        areaLabel: "Pedagógica",
        reference: `TUR-${turmasComDados.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Turmas",
            rows: turmasComDados.map((row) => ({
              label: String(row.nome),
              value: `${row.alunosActuais}/${row.capacidadeReal} alunos`,
              note: [row.curso, row.classe, row.turno].filter(Boolean).join(" · "),
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "turmas-oficial",
          "Lista de turmas",
          {
            schoolName: school?.name ?? "Escola",
            academicYear:
              activeYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              activeYearLabel,
              String(turmasComDados.length),
            ]),
          },
          [...turmaExportColumns],
          turmasComDados,
        ),
    });
  };

  const bootstrapStructure = async () => {
    setBootstrapping(true);
    try {
      const result = await ensureAcademicDefaults({
        data: { yearCode: "2024-2025", yearName: activeYearLabel },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] });
      toast.success(
        result.created.length
          ? `Estrutura preparada: ${result.created.join(", ")}.`
          : "A estrutura académica já estava pronta.",
      );
    } catch (error) {
      toast.error("Não foi possível preparar a estrutura", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setBootstrapping(false);
    }
  };

  const [dropoutModalOpen, setDropoutModalOpen] = useState(false);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title="Área Pedagógica"
          description="Turmas, disciplinas, notas e horários ligados ao Supabase."
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5 text-xs shadow-2xs">
                    <Sparkles className="size-3.5 text-primary" /> Ferramentas{" "}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => {
                      window.open(getSigaNavDocUrl(), "_blank", "noopener,noreferrer");
                    }}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Sparkles className="size-3.5 text-primary" /> Manual de navegação (DOC)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setTab("notas");
                      setAssessmentOpen(true);
                      toast.message("Centro de Avaliação", {
                        description:
                          "Lance MAC/NPP/NPT na grelha digital. OCR de papel ainda não está ligado.",
                      });
                    }}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Sparkles className="size-3.5 text-primary" /> Lançar notas (grelha viva)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDropoutModalOpen(true)}
                    className="gap-2 text-xs text-destructive cursor-pointer"
                  >
                    <ShieldAlert className="size-3.5 text-destructive" /> Relatório Risco Abandono
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5 text-xs shadow-2xs">
                    <Download className="size-3.5" /> Exportação & Pautas{" "}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={exportarPautaOficial}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Award className="size-3.5 text-primary" /> Pauta Oficial PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarPautaPdf}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <FileDown className="size-3.5" /> Pauta Simples PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarPautaCsv}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Download className="size-3.5" /> Exportar Pauta CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarTurmasOficial}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Award className="size-3.5 text-primary" /> Turmas Oficial PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarTurmasCsv}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Download className="size-3.5" /> Exportar Turmas CSV
                  </DropdownMenuItem>
                  <div className="my-1 border-t border-border" />
                  <DropdownMenuItem asChild className="gap-2 text-xs cursor-pointer">
                    <Link to="/importar" search={{ tab: "novo", modulo: "turmas" }}>
                      <FileUp className="size-3.5 text-primary" /> Importar Turmas (Excel)
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="gap-2 text-xs cursor-pointer">
                    <Link to="/importar" search={{ tab: "novo", modulo: "disciplinas" }}>
                      <FileUp className="size-3.5 text-primary" /> Importar Disciplinas (Excel)
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="gap-2 text-xs cursor-pointer">
                    <Link to="/importar" search={{ tab: "novo", modulo: "salas" }}>
                      <FileUp className="size-3.5 text-primary" /> Importar Salas (Excel)
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="gap-2 text-xs cursor-pointer">
                    <Link to="/importar" search={{ tab: "novo", modulo: "notas" }}>
                      <FileUp className="size-3.5 text-primary" /> Importar Notas (Excel)
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DocHelpButton title="Navegação e permissões — área pedagógica" />
              {canManageAcademic && structureReady ? (
                <ClassGroupSheet
                  yearOptions={yearOptions}
                  gradeOptions={gradeOptions}
                  roomOptions={roomOptions}
                  yearIds={academicYears.map((year) => year.id)}
                  gradeIds={visibleGradeLevels.map((grade) => grade.id)}
                  roomIds={rooms.map((room) => room.id)}
                  onCreated={async () => {
                    await queryClient.invalidateQueries({
                      queryKey: ["academic", "pedagogical-workspace"],
                    });
                    onTabChange("turmas");
                  }}
                  trigger={(open) => (
                    <Button className="gap-2" onClick={open}>
                      <Plus className="size-4" /> Nova turma
                    </Button>
                  )}
                />
              ) : null}
            </>
          }
        />

        <StatGrid
          collapsible
          storageKey="pedagogica"
          items={[
            {
              label: "Turmas activas",
              value: canManageAcademic ? String(turmasComDados.length) : "—",
              hint: canManageAcademic
                ? `${new Set(turmasComDados.map((turma) => turma.turno)).size || 0} turnos em funcionamento`
                : "Disponível para Secretaria/Admin",
            },
            {
              label: "Disciplinas",
              value: canManageAcademic && subjectsAvailable ? String(subjects.length) : "—",
              hint: !subjectsAvailable
                ? "Migração pendente"
                : canManageAcademic
                  ? "Catálogo activo"
                  : "Disponível para Secretaria/Admin",
            },
            {
              label: "Média geral",
              value:
                canManageAcademic && gradesAvailable && termGrades.length
                  ? mediaNotas.toFixed(1)
                  : "—",
              hint: "Escala 0 – 20",
            },
            {
              label: "Taxa de aproveitamento",
              value:
                canManageAcademic && gradesAvailable && termGrades.length
                  ? `${taxaAproveitamento}%`
                  : "—",
              hint:
                assiduidadeSafe > 0
                  ? `${Math.round(assiduidadeSafe)}% assiduidade nas turmas`
                  : "Com base nas notas lançadas",
            },
          ]}
        />

        <Tabs value={tab} onValueChange={onTabChange}>
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="turmas">Turmas</TabsTrigger>
            <TabsTrigger value="disciplinas">Disciplinas</TabsTrigger>
            <TabsTrigger value="salas">Salas & Espaços</TabsTrigger>
            <TabsTrigger value="curriculo">Currículo & Turnos</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="notas">Notas</TabsTrigger>
            <TabsTrigger value="presencas">Presenças / Chamada</TabsTrigger>
            <TabsTrigger value="pautas">Modelos de Pauta</TabsTrigger>
          </TabsList>
          <div className="mt-4">
            <InstalledModuleTools
              module="pedagogica"
              onExport={(kind) => {
                if (kind === "sige_classes") exportarTurmasCsv();
              }}
            />
            <div className="mt-3">
              <PickFileButton
                area="escola"
                onPick={(file) =>
                  toast.success(file.name, { description: "Material da biblioteca pedagógica." })
                }
              />
            </div>
          </div>

          <TabsContent value="turmas" className="mt-5 space-y-6">
            <TurmasWorkspaceTab
              canReadAcademic={canReadAcademic}
              canManageAcademic={canManageAcademic}
              isLoading={workspaceQuery.isLoading}
              isError={workspaceQuery.isError}
              errorMessage={
                workspaceQuery.error instanceof Error ? workspaceQuery.error.message : undefined
              }
              structureReady={structureReady}
              bootstrapping={bootstrapping}
              bootstrapStructure={bootstrapStructure}
              filters={filters}
              setFilter={(name, value) => setFilter(name as keyof typeof filters, value)}
              resetFilters={resetFilters}
              activeCount={activeCount}
              courses={courses}
              turmasComDados={turmasComDados}
              workspace={workspace}
              teacherNameById={teacherNameById}
              classroomOn={classroomOn}
              moodleOn={moodleOn}
              canvasOn={canvasOn}
              classroomWork={classroomWork}
              moodleGrades={moodleGrades}
              canvasWork={canvasWork}
              teamsClasses={teamsClasses}
              onedriveOn={onedriveOn}
              onOpenTurma={(id) => setOpenTurmaId(id)}
            />
          </TabsContent>

          <TabsContent value="disciplinas" className="mt-5">
            <DisciplinasWorkspaceTab
              canManageAcademic={canManageAcademic}
              subjectsAvailable={subjectsAvailable}
              subjects={subjects}
              workspace={workspace}
              teacherOptions={teacherOptions}
              turmaAssignOptions={turmaAssignOptions}
              subjectOptions={subjectOptions}
              classGroups={classGroups}
              teachers={teachers}
              teacherNameById={teacherNameById}
              teachingLevels={teachingLevels}
              classroomOn={classroomOn}
              moodleOn={moodleOn}
              subjectTypes={subjectTypesQuery.data ?? []}
              curriculumAreas={curriculumAreasQuery.data ?? []}
              onRefresh={refreshAcademic}
            />
          </TabsContent>

          <TabsContent value="notas" className="mt-5 space-y-6">
            <Panel
              title="Pauta de avaliação"
              description="Modelo angolano: turma × disciplina × trimestre, com MAC, NPP, NPT e foto do aluno"
              action={
                <div className="flex flex-wrap gap-2">
                  {gradesAvailable && enrollmentOptions.length > 0 && subjects.length > 0 ? (
                    <Button size="sm" className="gap-1.5" onClick={() => setAssessmentOpen(true)}>
                      <Sparkles className="size-3.5" /> Avaliação
                    </Button>
                  ) : null}
                  {canLaunchGrades &&
                  gradesAvailable &&
                  enrollmentOptions.length > 0 &&
                  subjects.length > 0 ? (
                    <QuickFormModal
                      title="Lançar nota avulsa"
                      eyebrow="Avaliação"
                      description="Ajuste pontual de um aluno. Para a turma inteira use a grelha da pauta."
                      icon={<Plus className="size-5" />}
                      submitLabel="Guardar nota"
                      onSubmit={async (values) => {
                        const enrollmentId = resolveOptionId(
                          enrollmentSelectOptions,
                          values["matricula"],
                          enrollmentOptions.map((row) => row.id),
                        );
                        const subjectId = resolveOptionId(
                          subjectOptions,
                          values["disciplina"],
                          subjects.map((row) => row.id),
                        );
                        const termMap = { "1º": 1, "2º": 2, "3º": 3 } as const;
                        const term =
                          termMap[(values["trimestre"] as keyof typeof termMap) ?? "1º"] ?? 1;
                        if (!enrollmentId || !subjectId) {
                          throw new Error("Seleccione matrícula e disciplina.");
                        }
                        await upsertTermGrade({
                          data: {
                            enrollmentId,
                            subjectId,
                            term,
                            mac: Number(values["mac"]),
                            npp: Number(values["npp"]),
                            npt: Number(values["npt"]),
                          },
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ["academic", "pedagogical-workspace"],
                        });
                      }}
                      fields={[
                        {
                          name: "matricula",
                          label: "Aluno / turma",
                          type: "select",
                          options: enrollmentSelectOptions,
                          full: true,
                        },
                        {
                          name: "disciplina",
                          label: "Disciplina",
                          type: "select",
                          options: subjectOptions,
                        },
                        {
                          name: "trimestre",
                          label: "Trimestre",
                          type: "select",
                          options: ["1º", "2º", "3º"],
                        },
                        { name: "mac", label: "MAC", type: "number", placeholder: "0–20" },
                        { name: "npp", label: "NPP", type: "number", placeholder: "0–20" },
                        { name: "npt", label: "NPT", type: "number", placeholder: "0–20" },
                      ]}
                      trigger={(open) => (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={open}>
                          <Plus className="size-3.5" /> Avulsa
                        </Button>
                      )}
                    />
                  ) : null}
                </div>
              }
            >
              {!gradesAvailable ? (
                <p className="text-sm text-muted-foreground">
                  O módulo de notas SGA (<code className="font-mono">gradebooks</code> /{" "}
                  <code className="font-mono">grade_scores</code>) não respondeu. Confirme
                  permissões e schema no projecto.
                </p>
              ) : enrollmentOptions.length === 0 || subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Precisa de matrículas activas e disciplinas no catálogo para abrir a pauta.
                </p>
              ) : (
                <GradePautaSheet
                  schoolName={school?.name ?? "Escola"}
                  academicYear={activeYearLabel}
                  classGroups={classGroups.filter((group) =>
                    gradeMatchesTeachingLevels(String(group.grade_name ?? ""), teachingLevels),
                  )}
                  subjects={subjects}
                  enrollments={enrollmentOptions}
                  termGrades={termGrades}
                  passingGrade={school?.passing_grade ?? 10}
                  canLaunch={canLaunchGrades}
                  canLockTerm={account.role === "Administrador"}
                  closedTerms={school?.pedagogy?.closedTerms ?? []}
                  evaluationPeriods={school?.evaluation_periods}
                />
              )}
            </Panel>

            <Panel
              title="Histórico da pauta"
              description={`${notasFiltradas.length} lançamentos filtrados · pesquisa e trimestre da barra de filtros`}
            >
              {notasFiltradas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem notas lançadas para os filtros actuais.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aluno</TableHead>
                        <TableHead>Turma</TableHead>
                        <TableHead>Disciplina</TableHead>
                        <TableHead>Trim.</TableHead>
                        <TableHead className="text-right">MAC</TableHead>
                        <TableHead className="text-right">NPP</TableHead>
                        <TableHead className="text-right">NPT</TableHead>
                        <TableHead className="text-right">Média</TableHead>
                        <TableHead className="text-right">Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notasFiltradas.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <UserAvatar
                                url={n.student_photo_url}
                                initials={initialsFromName(n.student_name)}
                                className="size-9 bg-primary-soft text-[11px] font-extrabold text-primary"
                              />
                              <span className="font-semibold">{n.student_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{n.class_group_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {n.subject_name}
                          </TableCell>
                          <TableCell>{n.term_label}</TableCell>
                          <TableCell className="text-right">{n.mac}</TableCell>
                          <TableCell className="text-right">{n.npp}</TableCell>
                          <TableCell className="text-right">{n.npt}</TableCell>
                          <TableCell className="text-right font-bold">
                            {n.average.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                badgeBase,
                                n.average >= 10 ? toneClass.success : toneClass.danger,
                              )}
                            >
                              {n.average >= 10 ? "Transita" : "Não transita"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Panel>

            <Suspense
              fallback={
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="h-[320px] animate-pulse rounded-2xl bg-muted/40" />
                  <div className="h-[320px] animate-pulse rounded-2xl bg-muted/40" />
                </div>
              }
            >
              <PedagogicaNotasCharts
                aproveitamentoPorClasse={aproveitamentoPorClasse}
                mediaPorTrimestre={mediaPorTrimestre}
                hasTermGrades={termGrades.length > 0}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="salas" className="mt-5 space-y-6">
            <SalasWorkspaceTab canManage={canManageAcademic} />
          </TabsContent>

          <TabsContent value="curriculo" className="mt-5 space-y-6">
            <CurriculoWorkspaceTab
              canManage={canManageAcademic}
              activeYearId={selectedYearId ?? undefined}
              courses={courses.map((c) => ({ id: c.id, name: c.name, code: c.code }))}
              gradeLevels={visibleGradeLevels.map((g) => ({
                id: g.id,
                name: g.name,
                code: g.code,
              }))}
              subjects={subjects.map((s) => ({
                id: s.id,
                name: s.name,
                code: s.code,
                subject_type_id: s.subject_type_id,
              }))}
              teachers={teachers.map((t) => ({ id: t.id, name: t.full_name || "Docente" }))}
            />
          </TabsContent>

          <TabsContent value="horarios" className="mt-5 space-y-6">
            <SchoolNowWidget />
            <ScheduleWorkspace
              activeYearLabel={activeYearLabel}
              activeYearId={selectedYearId ?? undefined}
              canManage={canManageAcademic}
              scheduleAvailable={scheduleAvailable}
              classGroups={classGroups}
              subjects={subjects}
              classSubjects={classSubjects}
              rooms={classrooms.map((r) => ({
                id: r.id,
                name: r.name,
                code: r.code || r.name,
                capacity: r.capacity,
                room_type: r.room_type || "standard",
              }))}
              teachers={teachers.map((t) => ({
                id: t.id,
                name: t.full_name || "Docente",
              }))}
              slots={scheduleSlots}
              virtualRooms={[
                ...(zoomOn ? [{ label: "Zoom", url: meetingRoomLink("zoom") }] : []),
                ...(teamsOn ? [{ label: "Teams", url: meetingRoomLink("teams") }] : []),
              ]}
              onCreateSlot={async (data) => {
                const { warnings } = await createAdvancedScheduleSlot({ data });
                for (const warning of warnings) {
                  toast.warning(warning.message);
                }
                await refreshAcademic();
              }}
              onUpdateSlot={async (data) => {
                const { warnings } = await updateAdvancedScheduleSlot({ data });
                for (const warning of warnings) {
                  toast.warning(warning.message);
                }
                await refreshAcademic();
              }}
              onDeleteSlot={async (slotId) => {
                await deleteScheduleSlot({ data: { slotId } });
                await refreshAcademic();
              }}
              onPublishSchedule={async (classGroupId) => {
                if (selectedYearId) {
                  await publishAcademicSchedule({
                    data: {
                      classGroupId,
                      academicYearId: selectedYearId,
                      syncToCalendar: true,
                    },
                  });
                  await refreshAcademic();
                }
              }}
            />
          </TabsContent>

          <TabsContent value="presencas" className="mt-5 space-y-6">
            <AttendanceWorkspaceModule
              initialClassGroupId={turmaFromSearch}
              initialSubjectId={disciplinaFromSearch}
              initialDate={diaFromSearch}
            />
          </TabsContent>

          <TabsContent value="chamada" className="mt-5 space-y-6">
            <AttendanceWorkspaceModule
              initialClassGroupId={turmaFromSearch}
              initialSubjectId={disciplinaFromSearch}
              initialDate={diaFromSearch}
            />
          </TabsContent>

          <TabsContent value="pautas" className="mt-5 space-y-6">
            <PautasWorkspaceModule workspace={workspace} />
          </TabsContent>
        </Tabs>
      </div>
      <Suspense fallback={null}>
        <AssessmentCenter
          open={assessmentOpen}
          onOpenChange={setAssessmentOpen}
          schoolName={school?.name ?? "Escola"}
          academicYear={activeYearLabel}
          directorName={school?.director_name}
          classGroups={classGroups.filter((group) =>
            gradeMatchesTeachingLevels(String(group.grade_name ?? ""), teachingLevels),
          )}
          subjects={subjects}
          enrollments={enrollmentOptions}
          termGrades={termGrades}
          classSubjects={classSubjects}
          passingGrade={school?.passing_grade ?? 10}
          canLaunch={canLaunchGrades}
          canLockTerm={account.role === "Administrador"}
          closedTerms={school?.pedagogy?.closedTerms ?? []}
          evaluationPeriods={school?.evaluation_periods}
          initialTerm={filters.trimestre}
          initialClassGroupId={turmaFromSearch}
          initialSubjectId={disciplinaFromSearch}
        />
      </Suspense>

      <TurmaProfileModal
        open={Boolean(openTurmaId)}
        onOpenChange={(next) => {
          if (!next) setOpenTurmaId(null);
        }}
        classGroupId={openTurmaId}
        workspace={workspace}
        teacherOptions={teacherOptions}
        teacherIds={teachers.map((teacher) => teacher.id)}
        onRefresh={refreshAcademic}
      />

      <DropoutRiskReportModal open={dropoutModalOpen} onOpenChange={setDropoutModalOpen} />
    </AppShell>
  );
}
