import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  FileText,
  FileUp,
  Search,
  ArrowRightLeft,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
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
import { StudentEnrollmentSheet } from "@/features/students/StudentEnrollmentSheet";
import { MediaAvatar } from "@/components/ui/media-frame";
import { IconChip } from "@/components/ui/icon-chip";
import { inferIcon } from "@/lib/auto-icon";
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
    if (!photoUrl) { setSignedUrl(null); return; }
    let cancelled = false;
    resolvePersonPhotoUrl(photoUrl)
      .then((url) => { if (!cancelled) setSignedUrl(url); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [photoUrl]);

  return signedUrl;
}

/**
 * Avatar da linha do aluno: carrega a foto do perfil (privada ou pública)
 * com fallback para iniciais col oridas.
 */
function StudentAvatar({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  const src = useSignedPhotoUrl(photoUrl);
  return (
    <MediaAvatar src={src} alt={name} className="size-9 shrink-0 rounded-xl object-cover" />
  );
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
import { listPedagogicalWorkspace, type PedagogicalWorkspace } from "@/features/academic/server";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
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
};

type SortKey = "processo" | "nome" | "email" | "telefone" | "estado";

function StudentsPage() {
  const queryClient = useQueryClient();
  const { activeYearLabel, selectedYearId, selectedYear, selectedYearLabel, school } =
    useSchoolSettings();
  const { action } = Route.useSearch();
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "alunos",
    alunosFilterDefaults,
  );
  const query = filters.q;
  const estado = filters.estado;
  const turma = filters.turma;
  const pagamento = filters.pagamento;
  const sortKey = (filters.sortKey as SortKey) || "nome";
  const sortDir = (filters.sortDir as "asc" | "desc") || "asc";
  const pageSize = Number(filters.pageSize) || 10;
  const page = Math.max(1, Number(filters.page) || 1);
  const setPage = (next: number) => setFilter("page", String(next));
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const sigeOn = installed.hasCapability("sige.export_students");

  useEffect(() => {
    if (action === "confirmar") setFilter("estado", "applicant");
    else if (action === "estado") setFilter("estado", "todos");
  }, [action, setFilter]);

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
      const matchQuery =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.registration_number.toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q) ||
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
      return matchQuery && matchStatus && matchTurma && matchPagamento && matchYear;
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
    estado,
    turma,
    pagamento,
    sortKey,
    sortDir,
    selectedYear,
    activeYearLabel,
  ]);

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
            if (kind === "sige_students") exportarAlunosCsv();
          }}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconChip {...inferIcon("Gestão de Estudantes")} size="lg" />
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
                    onClick={exportarAlunosCsv}
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
              autoOpen={action === "matricular"}
              classGroups={classGroups.map((group) => ({
                id: group.id,
                name: group.name,
                grade_name: group.grade_name,
                course_name: group.course_name,
                academic_year_id: String(group.academic_year_id ?? ""),
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
              }}
              trigger={(open) => (
                <Button className="gap-2" onClick={open}>
                  <UserPlus className="size-4" /> Nova Matrícula
                </Button>
              )}
            />
            <Link to="/importar">
              <Button variant="outline" className="gap-1.5">
                <FileUp className="size-4" /> Importar Excel
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

          <div className="overflow-x-auto">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
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
                      colSpan={8}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      A carregar estudantes…
                    </TableCell>
                  </TableRow>
                ) : studentsQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-destructive">
                      Não foi possível carregar os estudantes:{" "}
                      {studentsQuery.error instanceof Error
                        ? studentsQuery.error.message
                        : "erro desconhecido"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {s.registration_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                        <StudentAvatar photoUrl={s.photo_url} name={s.full_name} />
                          <div className="min-w-0">
                            <p className="whitespace-nowrap font-semibold">{s.full_name}</p>
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
                        <span className={cn(badge, estadoTone[s.student_status])}>
                          {estadoLabels[s.student_status] ?? s.student_status}
                        </span>
                        {s.payment_status ? (
                          <span className={cn(badge, "ml-1", pagamentoTone[s.payment_status])}>
                            {pagamentoLabels[s.payment_status] ?? s.payment_status}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs"
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
                                  onClick={open}
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
                                  onClick={open}
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
                                  onClick={open}
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
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhum aluno encontrado com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
            <span>
              A mostrar {filtered.length === 0 ? 0 : start + 1}–
              {Math.min(start + pageSize, filtered.length)} de {filtered.length} alunos
              {filtered.length !== allStudents.length ? ` (total ${allStudents.length})` : ""}
            </span>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <span>Por página</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setFilter("pageSize", e.target.value);
                    setPage(1);
                  }}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                  aria-label="Registos por página"
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && p - (arr[idx - 1] ?? p) > 1 ? (
                        <span className="px-1 opacity-60">…</span>
                      ) : null}
                      <Button
                        variant={p === currentPage ? "default" : "outline"}
                        size="icon"
                        className="size-8 text-xs"
                        aria-label={`Página ${p}`}
                        aria-current={p === currentPage ? "page" : undefined}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    </span>
                  ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Página seguinte"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
