import { useEffect, useId, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Award,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  GraduationCap,
  FileText,
  FileUp,
  Search,
  ArrowRightLeft,
  UserPlus,
  Users,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { whatsappHref } from "@/features/integrations/actions";
import { AppMark } from "@/features/integrations/app-marks";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { buildEmisExportPayload } from "@/features/integrations/emis";
import { StudentEnrollmentSheet } from "@/features/students/StudentEnrollmentSheet";
import { StudentExtensiveModal } from "@/features/students/components/StudentExtensiveModal";
import { StudentStatusBadge } from "@/features/students/components/StudentStatusBadge";
import { StudentFinanceBadge } from "@/features/students/components/StudentFinanceBadge";
import {
  computeDynamicCounters,
  matchesQuickCategory,
  type QuickFilterCategory,
  type InactiveSubFilter,
  type CandidateSubFilter,
} from "@/features/students/academic-status";
import { batchAssignClass, batchUpdateStudentStatus } from "@/features/students/server";
import { studentStatusOptions } from "@/features/students/schemas";
import { ListPaginationBar } from "@/components/filters/ListPaginationBar";
import { MediaAvatar } from "@/components/ui/media-frame";
import { IconChip } from "@/components/ui/icon-chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  isPrivateSigaFile,
  prefetchPersonPhotoUrls,
  resolvePersonPhotoUrl,
} from "@/features/arquivos/person-photo-url";

/**
 * Resolve a `photo_url` de uma pessoa para uma URL directa:
 * - URLs normais (http) são usadas tal como estão.
 * - Referências privadas `siga-file://ID` são assinadas on-demand com cache TTL de 100s.
 * Devolve `null` enquanto assina ou se falhar — o avatar usa iniciais como fallback.
 */
function useSignedPhotoUrl(photoUrl: string | null): string | null {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoUrl) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    resolvePersonPhotoUrl(photoUrl)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  return signedUrl;
}

/**
 * Avatar da linha do aluno: carrega a foto do perfil (privada ou pública)
 * com fallback para iniciais col oridas.
 */
function StudentAvatar({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  const src = useSignedPhotoUrl(photoUrl);
  return <MediaAvatar src={src} alt={name} className="size-9 shrink-0 rounded-xl object-cover" />;
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { searchPeople } from "@/features/people/server";
import {
  changeStudentStatus,
  enrollStudentInClass,
  searchStudents,
} from "@/features/students/server";
import { listEnrollmentApplications } from "@/features/enrollment/server";
import { listPedagogicalWorkspace, type PedagogicalWorkspace } from "@/features/academic/server";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useTenant } from "@/features/saas/tenant-context";
import { buildStudentCapacity } from "@/features/saas/tenant-limits";
import { getPricingUrl } from "@/lib/ecosystem-urls";
import { cn } from "@/lib/utils";
import { exportCsv } from "@/lib/export-csv";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";

const alunosSearchSchema = z
  .object({
    action: z.enum(["matricular", "confirmar", "estado"]).optional(),
  })
  .passthrough();

const alunosFilterDefaults = {
  q: "",
  categoria: "todos",
  subInactivos: "todos",
  subCandidatos: "todos",
  estado: "todos",
  turma: "todas",
  pagamento: "todos",
  sortKey: "nome",
  sortDir: "asc",
  pageSize: "10",
  page: "1",
};

export const Route = createFileRoute("/alunos/")({
  validateSearch: alunosSearchSchema,
  head: () => ({
    meta: [
      { title: "Gestão de Alunos · SIGA" },
      {
        name: "description",
        content:
          "Lista de alunos matriculados: pesquisa por nome ou processo, filtros por classe e estado, situação financeira e média final.",
      },
      { property: "og:title", content: "Gestão de Alunos · SIGA" },
      {
        property: "og:description",
        content: "Pesquise, filtre e consulte a ficha completa de cada aluno da escola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentsPage,
});

const selectClass = "h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground";

const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

const estadoLabels: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  transferred: "Transferido",
  graduated: "Concluído",
  applicant: "Candidato",
};

const estadoTone: Record<string, string> = {
  active: "bg-primary text-primary-foreground",
  inactive: "bg-muted text-muted-foreground",
  transferred: "border border-destructive/30 bg-destructive/10 text-destructive-strong",
  graduated: "bg-success/15 text-success",
  applicant: "bg-warning/20 text-warning-foreground",
};

const pagamentoLabels: Record<string, string> = {
  settled: "Regularizado",
  pending: "Pendente",
  overdue: "Em dívida",
};

const pagamentoTone: Record<string, string> = {
  settled: "bg-success/15 text-success",
  pending: "bg-warning/20 text-warning-foreground",
  overdue: "bg-destructive/12 text-destructive",
};

type StudentRow = {
  id: string;
  registration_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  student_status: string;
  payment_status: string | null;
  grade_name: string | null;
  class_name: string | null;
  class_group_id: string | null;
  academic_year: string | null;
  primary_guardian_name: string | null;
  debt_amount?: number;
  overdue_count?: number;
  has_debt?: boolean;
  total_billed?: number;
  total_paid?: number;
  national_id?: string | null;
};

type SortKey = "processo" | "nome" | "email" | "telefone" | "estado";

function StudentsPage() {
  const realtimeInstanceId = useId();
  const queryClient = useQueryClient();
  const { activePlan, activeTenant, refreshTenant } = useTenant();
  const { activeYearLabel, selectedYearId, selectedYear, selectedYearLabel, school } =
    useSchoolSettings();
  const { action } = Route.useSearch();
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "alunos",
    alunosFilterDefaults,
  );
  const query = filters.q;
  const categoria = (filters.categoria || "todos") as QuickFilterCategory;
  const subInactivos = (filters.subInactivos || "todos") as InactiveSubFilter;
  const subCandidatos = (filters.subCandidatos || "todos") as CandidateSubFilter;
  const estado = filters.estado;
  const turma = filters.turma;
  const pagamento = filters.pagamento;
  const sortKey = (filters.sortKey as SortKey) || "nome";
  const sortDir = (filters.sortDir as "asc" | "desc") || "asc";
  const pageSize = Number(filters.pageSize) || 10;
  const page = Math.max(1, Number(filters.page) || 1);
  const setPage = (next: number) => setFilter("page", String(next));
  const [extensiveModalStudent, setExtensiveModalStudent] = useState<StudentRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const sigeOn = installed.hasCapability("sige.export_students");

  const studentCapacity = useMemo(
    () => buildStudentCapacity(activeTenant?.active_students_count ?? 0, activeTenant, activePlan),
    [activeTenant, activePlan],
  );
  const capacityBlocked = studentCapacity.atLimit
    ? `Limite de alunos atingido (${studentCapacity.activeStudents}/${studentCapacity.maxStudents}).`
    : null;

  useEffect(() => {
    if (action === "matricular" && capacityBlocked) {
      toast.error(capacityBlocked, {
        description: "Actualize o plano no portal comercial SIGA Plus.",
      });
    }
  }, [action, capacityBlocked]);

  useEffect(() => {
    if (action === "confirmar") {
      setFilter("categoria", "candidatos");
      setFilter("estado", "applicant");
    } else if (action === "estado") {
      setFilter("categoria", "todos");
      setFilter("estado", "todos");
    }
  }, [action, setFilter]);

  // Realtime — atualiza a lista de alunos quando há novidades
  useEffect(() => {
    const channel = supabase
      .channel(`alunos_realtime:${realtimeInstanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["students", "search"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "enrollments" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["students", "search"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_invoices" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["students", "search"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_receipts" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["students", "search"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enrollment_applications" },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["enrollment", "applications", "pending-count"],
          });
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, realtimeInstanceId]);

  const actionHint =
    action === "matricular"
      ? "Abra o formulário de nova matrícula para registar o aluno."
      : action === "confirmar"
        ? "Candidatos sem turma. Use Turma na lista ou abra a ficha para confirmar a matrícula."
        : action === "estado"
          ? "Use Estado na lista para activar, transferir ou concluir o aluno."
          : null;

  const studentsQuery = useQuery({
    queryKey: ["students", "search"],
    queryFn: () => searchStudents({ data: { limit: 100, offset: 0 } }),
  });
  const pendingApplicationsQuery = useQuery({
    queryKey: ["enrollment", "applications", "pending-count"],
    queryFn: () => listEnrollmentApplications({ data: { status: "pending", limit: 100 } }),
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
  });
  const peopleQuery = useQuery({
    queryKey: ["people", "search", ""],
    queryFn: () => searchPeople({ data: { query: "", limit: 50 } }),
  });
  const allStudents = useMemo(
    () => (studentsQuery.data ?? []) as StudentRow[],
    [studentsQuery.data],
  );
  const pendingApplicationsCount = pendingApplicationsQuery.data?.length ?? 0;
  const classGroups = workspaceQuery.data?.classGroups ?? [];
  const turmaOptions = classGroups
    .filter((group) => group.academic_year_id)
    .map((group) => `${group.name}${group.grade_name ? ` · ${group.grade_name}` : ""}`);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const yearHints = selectedYear
      ? [selectedYear.code, selectedYear.name, selectedYear.label, activeYearLabel]
          .filter(Boolean)
          .map((value) => value.toLowerCase())
      : [];
    const rows = allStudents.filter((s) => {
      const matchCategory = matchesQuickCategory(s, categoria, subInactivos, subCandidatos);
      const matchQuery =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.registration_number.toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q) ||
        (s.national_id ?? "").toLowerCase().includes(q) ||
        (s.class_name ?? "").toLowerCase().includes(q) ||
        (s.grade_name ?? "").toLowerCase().includes(q) ||
        (s.primary_guardian_name ?? "").toLowerCase().includes(q);
      const matchStatus = estado === "todos" || s.student_status === estado;
      const matchTurma = turma === "todas" || (s.class_name ?? "") === turma;
      const matchPagamento = pagamento === "todos" || (s.payment_status ?? "") === pagamento;
      const studentYear = (s.academic_year ?? "").toLowerCase();
      const matchYear =
        !selectedYear ||
        !studentYear ||
        yearHints.some(
          (hint) =>
            studentYear === hint || studentYear.includes(hint) || hint.includes(studentYear),
        );
      return (
        matchCategory && matchQuery && matchStatus && matchTurma && matchPagamento && matchYear
      );
    });

    const valueFor = (row: StudentRow, key: SortKey) => {
      switch (key) {
        case "processo":
          return row.registration_number;
        case "nome":
          return row.full_name;
        case "email":
          return row.email ?? "";
        case "telefone":
          return row.phone ?? "";
        case "estado":
          return row.student_status;
      }
    };

    return [...rows].sort((a, b) => {
      const cmp = String(valueFor(a, sortKey)).localeCompare(String(valueFor(b, sortKey)), "pt", {
        numeric: true,
        sensitivity: "base",
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [
    allStudents,
    query,
    categoria,
    subInactivos,
    subCandidatos,
    estado,
    turma,
    pagamento,
    sortKey,
    sortDir,
    selectedYear,
    activeYearLabel,
  ]);

  const quickCounts = useMemo(
    () => computeDynamicCounters(allStudents, pendingApplicationsCount),
    [allStudents, pendingApplicationsCount],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const pagedPhotoUrls = paged.map((s) => s.photo_url).filter(Boolean) as string[];
  const pagedPhotoKey = pagedPhotoUrls.join("|");
  useEffect(() => {
    if (!pagedPhotoKey) return;
    void prefetchPersonPhotoUrls(pagedPhotoKey.split("|"));
  }, [pagedPhotoKey]);

  const alunoExportColumns = [
    {
      label: "Processo",
      value: (row: StudentRow) => row.registration_number,
    },
    { label: "Aluno", value: (row: StudentRow) => row.full_name },
    { label: "Classe", value: (row: StudentRow) => row.grade_name ?? "" },
    { label: "Turma", value: (row: StudentRow) => row.class_name ?? "" },
    {
      label: "Estado",
      value: (row: StudentRow) => estadoLabels[row.student_status] ?? row.student_status,
    },
    {
      label: "Pagamento",
      value: (row: StudentRow) =>
        row.payment_status ? (pagamentoLabels[row.payment_status] ?? row.payment_status) : "",
    },
    { label: "Telefone", value: (row: StudentRow) => row.phone ?? "" },
    { label: "Email", value: (row: StudentRow) => row.email ?? "" },
  ];

  const exportarAlunosCsv = () => exportCsv("alunos-filtrados", alunoExportColumns, filtered);
  const exportarAlunosSige = () => {
    const sigeData = buildEmisExportPayload(activeTenant?.id ?? "school", filtered);
    type EmisRow = (typeof sigeData)[number];
    exportCsv(
      "alunos-sige-emis",
      (Object.keys(sigeData[0] ?? {}) as Array<keyof EmisRow>).map((k) => ({
        label: k,
        value: (r: EmisRow) => r[k] ?? "",
      })),
      sigeData,
    );
  };
  const exportarAlunosPdf = () =>
    exportPdfTable(
      "alunos-filtrados",
      "Lista de alunos",
      alunoExportColumns,
      filtered,
      `Filtros activos: ${activeCount || "nenhum"} · ${activeYearLabel}`,
    );
  const exportarAlunosOficial = () => {
    const academicYear =
      selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "";
    void issuePrintDocument({
      tipo: "Lista de alunos",
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
        name: "Lista de alunos",
        areaLabel: "Secretaria",
        reference: `ALU-${filtered.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Alunos",
            rows: filtered.map((row) => ({
              label: String(row.full_name),
              value: String(row.registration_number ?? "—"),
              note: [row.class_name, estadoLabels[String(row.student_status)] ?? row.student_status]
                .filter(Boolean)
                .join(" · "),
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "alunos-oficial",
          "Lista de alunos",
          {
            schoolName: school?.name ?? "Escola",
            academicYear,
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              String(filtered.length),
            ]),
          },
          alunoExportColumns,
          filtered,
        ),
    });
  };

  const changeSort = (key: SortKey) => {
    if (key === sortKey) {
      setFilter("sortDir", sortDir === "asc" ? "desc" : "asc");
    } else {
      setFilter("sortKey", key);
      setFilter("sortDir", "asc");
    }
    setPage(1);
  };

  const sortIcon = (key: SortKey) =>
    key !== sortKey ? (
      <ArrowUpDown className="size-3 opacity-40" />
    ) : sortDir === "asc" ? (
      <ArrowUp className="size-3 text-primary" />
    ) : (
      <ArrowDown className="size-3 text-primary" />
    );

  const SortHead = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => changeSort(colKey)}
        className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-foreground"
      >
        {label}
        {sortIcon(colKey)}
      </button>
    </TableHead>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <InstalledModuleTools
          module="alunos"
          onExport={(kind) => {
            if (kind === "sige_students") exportarAlunosSige();
          }}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconChip icon={GraduationCap} size="lg" label="Gestão de Estudantes" />
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">
                Gestão de Estudantes
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Gerencie matrículas e informações dos estudantes
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DocHelpButton title="Navegação — Gestão de alunos" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-1.5 text-xs shadow-2xs">
                  <Download className="size-3.5" /> Exportar Lista{" "}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={exportarAlunosOficial}
                  disabled={!filtered.length}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <Award className="size-3.5 text-primary" /> Lista Oficial PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={exportarAlunosPdf}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <FileDown className="size-3.5" /> Lista Simples PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={exportarAlunosCsv}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <Download className="size-3.5" /> Exportar Ficheiro CSV
                </DropdownMenuItem>
                {sigeOn ? (
                  <DropdownMenuItem
                    onClick={exportarAlunosSige}
                    disabled={!filtered.length}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <AppMark id="sige" className="size-3.5" /> Formato SIGE
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <PickFileButton
              area="secretaria"
              onPick={(file) =>
                toast.success(file.name, { description: "Ficheiro da ficha / matrícula." })
              }
            />
            <StudentEnrollmentSheet
              autoOpen={action === "matricular" && !capacityBlocked}
              classGroups={classGroups.map((group) => ({
                id: group.id,
                name: group.name,
                grade_name: group.grade_name,
                course_name: group.course_name,
                academic_year_id: String(group.academic_year_id ?? ""),
                // Sem o nome, o selector «Ano lectivo» caía no fallback e
                // mostrava o UUID cru ao utilizador.
                academic_year_name: String(group.academic_year_name ?? ""),
              }))}
              people={peopleQuery.data ?? []}
              onCreated={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
                  queryClient.invalidateQueries({ queryKey: ["people", "search"] }),
                  queryClient.invalidateQueries({
                    queryKey: ["academic", "pedagogical-workspace"],
                  }),
                ]);
                await refreshTenant();
              }}
              trigger={(open) => (
                <Button
                  className="gap-2"
                  disabled={Boolean(capacityBlocked)}
                  onClick={() => {
                    if (capacityBlocked) {
                      toast.error(capacityBlocked, {
                        description: "Actualize o plano no portal comercial SIGA Plus.",
                      });
                      return;
                    }
                    open();
                  }}
                >
                  <UserPlus className="size-4" /> Nova Matrícula
                </Button>
              )}
            />
            <Link to="/importar" search={{ tab: "novo", modulo: "alunos" }}>
              <Button variant="outline" className="gap-1.5">
                <FileUp className="size-4" /> Importar Alunos (Excel)
              </Button>
            </Link>
          </div>
        </div>

        {!workspaceQuery.isLoading && classGroups.length === 0 ? (
          <div className="rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3 text-sm text-primary-strong">
            Ainda não existem turmas na base de dados.{" "}
            <Link to="/pedagogica" search={{ tab: "turmas" }} className="font-semibold underline">
              Preparar turmas na Área Pedagógica
            </Link>{" "}
            para matricular directamente numa classe.
          </div>
        ) : null}

        {studentCapacity.nearLimit || studentCapacity.atLimit ? (
          <div
            className={
              studentCapacity.atLimit
                ? "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                : "rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {studentCapacity.atLimit
                  ? capacityBlocked
                  : `Quase no limite de alunos — ${studentCapacity.activeStudents}/${studentCapacity.maxStudents} (${studentCapacity.remaining} restantes).`}
              </span>
              <a
                href={getPricingUrl()}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline-offset-2 hover:underline"
              >
                Actualizar plano
              </a>
            </div>
          </div>
        ) : null}

        {actionHint ? (
          <div className="rounded-xl border border-primary/20 bg-primary-soft/60 px-4 py-3 text-sm text-primary-strong">
            {actionHint}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total de estudantes", value: allStudents.length, hint: "Nesta escola" },
            {
              label: "Activos",
              value: allStudents.filter(
                (s) => ["active", "applicant"].includes(s.student_status) || Boolean(s.class_name),
              ).length,
              hint: "Matrícula em curso",
            },
            {
              label: "Pagamentos em dívida",
              value: allStudents.filter((s) => s.payment_status === "overdue").length,
              hint: "A regularizar",
            },
            {
              label: "Transferidos/Concluídos",
              value: allStudents.filter((s) =>
                ["transferred", "graduated"].includes(s.student_status),
              ).length,
              hint: "Fora do activo",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border bg-card p-5 shadow-soft"
            >
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </div>
          ))}
        </div>

        <ListFilterBar
          values={filters}
          activeCount={activeCount}
          onChange={(name, value) => {
            setFilter(name as keyof typeof filters, value);
            if (
              name !== "page" &&
              name !== "pageSize" &&
              name !== "sortKey" &&
              name !== "sortDir"
            ) {
              setPage(1);
            }
          }}
          onReset={() => {
            resetFilters();
          }}
          extras={<span className={selectClass}>{activeYearLabel}</span>}
          chips={[
            ...(query ? [{ name: "q", label: "Pesquisa", value: query }] : []),
            ...(estado !== "todos"
              ? [
                  {
                    name: "estado",
                    label: "Estado",
                    value: estadoLabels[estado] ?? estado,
                    emptyValue: "todos",
                  },
                ]
              : []),
            ...(turma !== "todas"
              ? [{ name: "turma", label: "Turma", value: turma, emptyValue: "todas" }]
              : []),
            ...(pagamento !== "todos"
              ? [
                  {
                    name: "pagamento",
                    label: "Pagamento",
                    value: pagamentoLabels[pagamento] ?? pagamento,
                    emptyValue: "todos",
                  },
                ]
              : []),
          ]}
          fields={[
            {
              name: "q",
              placeholder: "Pesquisar por nome, email, número…",
              "aria-label": "Pesquisar aluno",
            },
            {
              name: "estado",
              type: "select",
              label: "Estado",
              emptyValue: "todos",
              options: [
                { value: "todos", label: "Todos os estados" },
                ...Object.entries(estadoLabels).map(([value, label]) => ({ value, label })),
              ],
            },
            {
              name: "turma",
              type: "select",
              label: "Turma",
              emptyValue: "todas",
              options: [
                { value: "todas", label: "Todas as turmas" },
                ...[...new Set(allStudents.map((row) => row.class_name).filter(Boolean))].map(
                  (name) => ({ value: String(name), label: String(name) }),
                ),
              ],
            },
            {
              name: "pagamento",
              type: "select",
              label: "Pagamento",
              emptyValue: "todos",
              options: [
                { value: "todos", label: "Todos os pagamentos" },
                ...Object.entries(pagamentoLabels).map(([value, label]) => ({ value, label })),
              ],
            },
          ]}
        />

        <div className="surface-card rounded-2xl border border-border p-4 shadow-soft space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Pesquisar aluno em tempo real..."
                value={query}
                onChange={(e) => {
                  setFilter("q", e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-9 text-sm rounded-xl"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-xl text-xs font-semibold"
                onClick={exportarAlunosOficial}
                disabled={!filtered.length}
              >
                <FileText className="size-4 text-primary" />
                Exportar PDF
              </Button>
            </div>
          </div>

          {/* Barra de Filtros Rápidos com Contadores Dinâmicos & Selector de Tamanho Premium */}
          <div className="flex flex-col gap-2 rounded-xl bg-secondary/30 p-2.5 border border-border/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground mr-1 hidden sm:inline">
                  Filtrar:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("categoria", "todos");
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                    categoria === "todos"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-background text-foreground hover:bg-muted border border-border/60",
                  )}
                >
                  Todos ({quickCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("categoria", "activos");
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                    categoria === "activos"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-background text-foreground hover:bg-muted border border-border/60",
                  )}
                >
                  Activos ({quickCounts.active})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("categoria", "candidatos");
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                    categoria === "candidatos"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-background text-foreground hover:bg-muted border border-border/60",
                  )}
                >
                  Candidatos ({quickCounts.applicant})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("categoria", "divida");
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                    categoria === "divida"
                      ? "bg-destructive text-destructive-foreground shadow-xs"
                      : "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20",
                  )}
                >
                  Com Dívida ({quickCounts.overdue})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("categoria", "inactivos");
                    setPage(1);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                    categoria === "inactivos"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-background text-foreground hover:bg-muted border border-border/60",
                  )}
                >
                  Inactivos/Outros ({quickCounts.other})
                </button>
              </div>

              {/* Controlo de Tamanho de Lista Premium */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                <span className="hidden md:inline font-medium text-[11px]">Linhas por página:</span>
                <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                  {[10, 25, 50, 100].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setFilter("pageSize", String(size));
                        setPage(1);
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                        pageSize === size
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <span className="font-mono text-[11px] font-semibold text-foreground hidden xl:inline">
                  {filtered.length > 0
                    ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} de ${filtered.length}`
                    : "0 alunos"}
                </span>
              </div>
            </div>

            {/* Subfiltros contextuais para Inactivos */}
            {categoria === "inactivos" ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                  Sub-estado:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("subInactivos", "todos");
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    subInactivos === "todos"
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  Todos ({quickCounts.other})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("subInactivos", "transferred");
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    subInactivos === "transferred"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  Transferidos ({quickCounts.inactivesDetail.transferred})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("subInactivos", "inactive");
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    subInactivos === "inactive"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  Desistentes ({quickCounts.inactivesDetail.inactive})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("subInactivos", "graduated");
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    subInactivos === "graduated"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  Concluídos ({quickCounts.inactivesDetail.graduated})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("subInactivos", "cancelled");
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    subInactivos === "cancelled"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-destructive/10 text-destructive hover:bg-destructive/20",
                  )}
                >
                  Cancelados ({quickCounts.inactivesDetail.cancelled})
                </button>
              </div>
            ) : null}

            {/* Subfiltros contextuais para Candidatos */}
            {categoria === "candidatos" ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1">Fase:</span>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("subCandidatos", "todos");
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    subCandidatos === "todos"
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  Todos os candidatos ({quickCounts.applicant})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("subCandidatos", "waiting_class");
                    setPage(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer",
                    subCandidatos === "waiting_class"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20",
                  )}
                >
                  Aguardando turma
                </button>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-3">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos nesta página"
                      className="size-4 rounded border-border text-primary cursor-pointer accent-primary"
                      checked={paged.length > 0 && selectedIds.length >= paged.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds([...new Set([...selectedIds, ...paged.map((s) => s.id)])]);
                        } else {
                          const pagedIdSet = new Set(paged.map((s) => s.id));
                          setSelectedIds(selectedIds.filter((id) => !pagedIdSet.has(id)));
                        }
                      }}
                    />
                  </TableHead>
                  <SortHead label="Nº Estudante" colKey="processo" />
                  <SortHead label="Nome" colKey="nome" />
                  <TableHead className="hidden lg:table-cell">Encarregado</TableHead>
                  <SortHead label="Email" colKey="email" />
                  <SortHead label="Telefone" colKey="telefone" />
                  <TableHead className="hidden xl:table-cell">Ano Lectivo</TableHead>
                  <SortHead label="Estado" colKey="estado" />
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      A carregar estudantes…
                    </TableCell>
                  </TableRow>
                ) : studentsQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-destructive">
                      Não foi possível carregar os estudantes:{" "}
                      {studentsQuery.error instanceof Error
                        ? studentsQuery.error.message
                        : "erro desconhecido"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((s) => (
                    <TableRow
                      key={s.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/60 group",
                        selectedIds.includes(s.id) && "bg-primary/5",
                      )}
                      onClick={() => setExtensiveModalStudent(s)}
                    >
                      <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${s.full_name}`}
                          className="size-4 rounded border-border text-primary cursor-pointer accent-primary"
                          checked={selectedIds.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, s.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== s.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {s.registration_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <StudentAvatar photoUrl={s.photo_url} name={s.full_name} />
                          <div className="min-w-0">
                            <p className="whitespace-nowrap font-semibold group-hover:text-primary transition-colors">
                              {s.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.grade_name ?? "Sem classe"}
                              {s.class_name ? (
                                <>
                                  {" · "}
                                  {s.class_group_id ? (
                                    <Link
                                      to="/pedagogica"
                                      search={{ tab: "turmas", turma: s.class_group_id }}
                                      onClick={(event) => event.stopPropagation()}
                                      className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    >
                                      Turma {s.class_name}
                                    </Link>
                                  ) : (
                                    `Turma ${s.class_name}`
                                  )}
                                </>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="hidden max-w-[180px] truncate text-sm text-muted-foreground lg:table-cell">
                        {s.primary_guardian_name ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {s.email ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <span className="inline-flex items-center gap-2">
                          {s.phone ?? "—"}
                          {whatsappOn && s.phone ? (
                            <a
                              href={whatsappHref(s.phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold text-primary hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              WhatsApp
                            </a>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="inline-flex rounded-lg bg-secondary px-2 py-1 font-mono text-[11px] text-secondary-foreground">
                          {s.academic_year ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <StudentStatusBadge status={s.student_status} size="sm" />
                          {s.payment_status ? (
                            <StudentFinanceBadge
                              status={s.payment_status}
                              debtAmount={s.debt_amount}
                              overdueCount={s.overdue_count}
                              size="sm"
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExtensiveModalStudent(s);
                            }}
                          >
                            <Eye className="size-3.5" /> Visualizar
                          </Button>
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Link to="/alunos/$studentId" params={{ studentId: s.id }}>
                              <FileText className="size-3.5" /> Ficha
                            </Link>
                          </Button>
                          {s.student_status === "applicant" &&
                          !s.class_name &&
                          turmaOptions.length > 0 ? (
                            <QuickFormModal
                              title={`Colocar ${s.full_name} na turma`}
                              description="Confirma a matrícula e activa o aluno na turma escolhida."
                              submitLabel="Colocar na turma"
                              successDescription="Aluno colocado na turma e estado actualizado para activo."
                              fields={[
                                {
                                  name: "turma",
                                  label: "Turma",
                                  type: "select",
                                  required: true,
                                  options: turmaOptions,
                                },
                              ]}
                              onSubmit={async (values) => {
                                const group = classGroups.find(
                                  (item) =>
                                    `${item.name}${item.grade_name ? ` · ${item.grade_name}` : ""}` ===
                                    values["turma"],
                                );
                                const yearId = String(group?.academic_year_id ?? "");
                                if (!group || !yearId) {
                                  throw new Error("Seleccione uma turma com ano lectivo.");
                                }
                                await enrollStudentInClass({
                                  data: {
                                    studentId: s.id,
                                    classGroupId: group.id,
                                    academicYearId: yearId,
                                  },
                                });
                                await Promise.all([
                                  queryClient.invalidateQueries({
                                    queryKey: ["students", "search"],
                                  }),
                                  queryClient.invalidateQueries({
                                    queryKey: ["academic", "pedagogical-workspace"],
                                  }),
                                  queryClient.invalidateQueries({
                                    queryKey: ["dashboard", "overview"],
                                  }),
                                ]);
                              }}
                              trigger={(open) => (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1 px-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    open();
                                  }}
                                >
                                  <Users className="size-3.5" /> Turma
                                </Button>
                              )}
                            />
                          ) : null}
                          {s.student_status === "active" &&
                          s.class_name &&
                          turmaOptions.length > 0 ? (
                            <QuickFormModal
                              title={`Mudar turma de ${s.full_name}`}
                              description="Actualiza a matrícula do ano lectivo da turma escolhida."
                              submitLabel="Mudar turma"
                              successDescription="Aluno transferido para a nova turma."
                              fields={[
                                {
                                  name: "turma",
                                  label: "Nova turma",
                                  type: "select",
                                  required: true,
                                  options: turmaOptions.filter((option) => option !== s.class_name),
                                },
                              ]}
                              onSubmit={async (values) => {
                                const group = classGroups.find(
                                  (item) =>
                                    `${item.name}${item.grade_name ? ` · ${item.grade_name}` : ""}` ===
                                    values["turma"],
                                );
                                const yearId = String(group?.academic_year_id ?? "");
                                if (!group || !yearId) {
                                  throw new Error("Seleccione uma turma com ano lectivo.");
                                }
                                await enrollStudentInClass({
                                  data: {
                                    studentId: s.id,
                                    classGroupId: group.id,
                                    academicYearId: yearId,
                                  },
                                });
                                await Promise.all([
                                  queryClient.invalidateQueries({
                                    queryKey: ["students", "search"],
                                  }),
                                  queryClient.invalidateQueries({
                                    queryKey: ["academic", "pedagogical-workspace"],
                                  }),
                                  queryClient.invalidateQueries({
                                    queryKey: ["dashboard", "overview"],
                                  }),
                                ]);
                              }}
                              trigger={(open) => (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1 px-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    open();
                                  }}
                                >
                                  <ArrowRightLeft className="size-3.5" /> Mudar
                                </Button>
                              )}
                            />
                          ) : null}
                          {s.student_status !== "applicant" ? (
                            <QuickFormModal
                              title={`Estado de ${s.full_name}`}
                              description="Altera o estado académico sem abrir a ficha."
                              submitLabel="Actualizar estado"
                              successDescription="Estado do aluno actualizado."
                              fields={[
                                {
                                  name: "estado",
                                  label: "Estado",
                                  type: "select",
                                  required: true,
                                  defaultValue: estadoLabels[s.student_status] ?? "Activo",
                                  options: ["Activo", "Inactivo", "Transferido", "Concluído"],
                                },
                                {
                                  name: "motivo",
                                  label: "Motivo",
                                  type: "textarea",
                                  required: false,
                                  full: true,
                                },
                              ]}
                              onSubmit={async (values) => {
                                const statusMap: Record<
                                  string,
                                  "active" | "inactive" | "transferred" | "graduated"
                                > = {
                                  Activo: "active",
                                  Inactivo: "inactive",
                                  Transferido: "transferred",
                                  Concluído: "graduated",
                                };
                                const newStatus = statusMap[values["estado"] ?? ""] ?? "active";
                                await changeStudentStatus({
                                  data: {
                                    studentId: s.id,
                                    newStatus,
                                    reason: values["motivo"] || undefined,
                                  },
                                });
                                await Promise.all([
                                  queryClient.invalidateQueries({
                                    queryKey: ["students", "search"],
                                  }),
                                  queryClient.invalidateQueries({
                                    queryKey: ["dashboard", "overview"],
                                  }),
                                ]);
                              }}
                              trigger={(open) => (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 gap-1 px-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    open();
                                  }}
                                >
                                  Estado
                                </Button>
                              )}
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {!studentsQuery.isLoading && !studentsQuery.isError && filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-4">
                      {categoria === "divida" ? (
                        <EmptyState
                          icon={CheckCircle2}
                          title="Nenhum aluno com dívida"
                          description="Todas as propinas e faturas emitidas para este conjunto de estudantes encontram-se regularizadas."
                          compact
                        />
                      ) : categoria === "candidatos" ? (
                        <EmptyState
                          icon={UserPlus}
                          title="Nenhum candidato pendente"
                          description="Não existem candidatos ou alunos aguardando colocação em turma para os filtros actuais."
                          compact
                        />
                      ) : (
                        <EmptyState
                          icon={GraduationCap}
                          title="Nenhum aluno encontrado"
                          description="Ajuste os filtros de pesquisa ou limpe os critérios para ver todos os alunos."
                          actionLabel="Limpar filtros"
                          onAction={resetFilters}
                          compact
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {/* Barra Flutuante de Ações em Massa */}
          {selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft/80 p-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {selectedIds.length}
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {selectedIds.length === 1 ? "aluno seleccionado" : "alunos seleccionados"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {turmaOptions.length > 0 ? (
                  <QuickFormModal
                    title={`Atribuir turma a ${selectedIds.length} alunos`}
                    description="Matricula em massa os alunos seleccionados na turma indicada."
                    submitLabel="Atribuir turma em lote"
                    successDescription="Turma atribuída aos alunos seleccionados."
                    fields={[
                      {
                        name: "turma",
                        label: "Turma",
                        type: "select",
                        required: true,
                        options: turmaOptions,
                      },
                    ]}
                    onSubmit={async (values) => {
                      const group = classGroups.find(
                        (item) =>
                          `${item.name}${item.grade_name ? ` · ${item.grade_name}` : ""}` ===
                          values["turma"],
                      );
                      const yearId = String(group?.academic_year_id ?? "");
                      if (!group || !yearId)
                        throw new Error("Seleccione uma turma com ano lectivo.");
                      await batchAssignClass({
                        data: {
                          studentIds: selectedIds,
                          classGroupId: group.id,
                          academicYearId: yearId,
                        },
                      });
                      toast.success(
                        `${selectedIds.length} alunos matriculados na turma ${group.name}.`,
                      );
                      setSelectedIds([]);
                      await queryClient.invalidateQueries({ queryKey: ["students", "search"] });
                    }}
                    trigger={(open) => (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 gap-1.5 text-xs font-semibold"
                        onClick={open}
                      >
                        <Users className="size-3.5" /> Atribuir Turma
                      </Button>
                    )}
                  />
                ) : null}

                <QuickFormModal
                  title={`Alterar estado de ${selectedIds.length} alunos`}
                  description="Actualiza o estado institucional de todos os alunos seleccionados."
                  submitLabel="Actualizar estado em lote"
                  successDescription="Estado dos alunos actualizado."
                  fields={[
                    {
                      name: "estado",
                      label: "Novo Estado",
                      type: "select",
                      required: true,
                      options: [
                        { value: "active", label: "Activo" },
                        { value: "inactive", label: "Desistente / Inactivo" },
                        { value: "transferred", label: "Transferido" },
                        { value: "graduated", label: "Concluído" },
                        { value: "applicant", label: "Candidato" },
                      ],
                    },
                    {
                      name: "motivo",
                      label: "Motivo / Justificação",
                      type: "text",
                      placeholder: "Ex: Transferência de ciclo, despacho institucional, etc.",
                      required: false,
                    },
                  ]}
                  onSubmit={async (values) => {
                    await batchUpdateStudentStatus({
                      data: {
                        studentIds: selectedIds,
                        newStatus: values["estado"] as (typeof studentStatusOptions)[number],
                        reason: values["motivo"] || undefined,
                      },
                    });
                    toast.success(`Estado de ${selectedIds.length} alunos actualizado.`);
                    setSelectedIds([]);
                    await queryClient.invalidateQueries({ queryKey: ["students", "search"] });
                  }}
                  trigger={(open) => (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs font-semibold"
                      onClick={open}
                    >
                      <ArrowRightLeft className="size-3.5" /> Mudar Estado
                    </Button>
                  )}
                />

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedIds([])}
                >
                  Desmarcar
                </Button>
              </div>
            </div>
          ) : null}

          <ListPaginationBar
            page={currentPage}
            pageSize={pageSize}
            totalItems={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setFilter("pageSize", String(newSize));
              setPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
          />

          <StudentExtensiveModal
            open={Boolean(extensiveModalStudent)}
            onOpenChange={(open) => {
              if (!open) setExtensiveModalStudent(null);
            }}
            studentId={extensiveModalStudent?.id ?? null}
            initialData={extensiveModalStudent}
          />
        </div>
      </div>
    </AppShell>
  );
}
