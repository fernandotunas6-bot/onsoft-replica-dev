import { useMemo, lazy, Suspense, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { whatsappHref } from "@/features/integrations/actions";
import { AppMark } from "@/features/integrations/app-marks";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPedagogicalWorkspace, type PedagogicalWorkspace } from "@/features/academic/server";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canReadModule } from "@/features/auth/access-policy";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { cn } from "@/lib/utils";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { exportCsv, type CsvValue } from "@/lib/export-csv";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { warmReportCharts } from "@/lib/warm-charts";

const RelatoriosAcademicosCharts = lazy(() =>
  import("@/features/academic/RelatoriosAcademicosCharts").then((module) => ({
    default: module.RelatoriosAcademicosCharts,
  })),
);

const relatoriosFilterDefaults = {
  q: "",
  trimestre: "todos",
  turma: "todas",
  resultado: "todos",
};

export const Route = createFileRoute("/relatorios/academicos")({
  head: () => ({
    meta: [
      { title: "Relatórios Académicos · SIGA" },
      {
        name: "description",
        content:
          "Aproveitamento por classe, médias trimestrais, desempenho por turma e ranking de disciplinas.",
      },
      { property: "og:title", content: "Relatórios Académicos · SIGA" },
      {
        property: "og:description",
        content: "Avalie aproveitamento, médias e desempenho pedagógico por turma e disciplina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelatoriosAcademicos,
});

function RelatoriosAcademicos() {
  useEffect(() => {
    warmReportCharts();
  }, []);
  const account = useCurrentAccount();
  const canRead = canReadModule(account.role, "pedagogica");
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const sigeOn = installed.hasCapability("sige.export_classes");
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "relatorios-academicos",
    relatoriosFilterDefaults,
  );

  const { selectedYearId, selectedYearLabel, school } = useSchoolSettings();
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: canRead,
    retry: false,
  });

  const workspace = workspaceQuery.data;
  const termGradesAll = useMemo(() => workspace?.termGrades ?? [], [workspace?.termGrades]);
  const subjects = workspace?.subjects ?? [];
  const classGroups = workspace?.classGroups ?? [];
  const gradesAvailable = workspace?.gradesAvailable !== false;
  const subjectsAvailable = workspace?.subjectsAvailable !== false;

  const termGrades = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return termGradesAll.filter((nota) => {
      const matchQ =
        !q ||
        nota.student_name.toLowerCase().includes(q) ||
        nota.class_group_name.toLowerCase().includes(q) ||
        nota.subject_name.toLowerCase().includes(q);
      const matchTrimestre =
        filters.trimestre === "todos" || String(nota.term) === filters.trimestre;
      const matchTurma = filters.turma === "todas" || nota.class_group_name === filters.turma;
      const matchResultado =
        filters.resultado === "todos" ||
        (filters.resultado === "aprovados" ? nota.average >= 10 : nota.average < 10);
      return matchQ && matchTrimestre && matchTurma && matchResultado;
    });
  }, [filters.q, filters.trimestre, filters.turma, filters.resultado, termGradesAll]);

  const mediaGeral =
    termGrades.length > 0
      ? termGrades.reduce((sum, nota) => sum + nota.average, 0) / termGrades.length
      : 0;
  const aprovados = termGrades.filter((nota) => nota.average >= 10).length;
  const taxaAprovados =
    termGrades.length > 0 ? Math.round((aprovados / termGrades.length) * 100) : 0;
  const taxaReprovados = termGrades.length > 0 ? 100 - taxaAprovados : 0;

  const attendanceValues = classGroups
    .map((group) => group.attendance_rate)
    .filter((value): value is number => value != null);
  const assiduidadeMedia =
    attendanceValues.length > 0
      ? Math.round(
          attendanceValues.reduce((sum, value) => sum + value, 0) / attendanceValues.length,
        )
      : null;

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

  const turmasComDados = classGroups.map((turma) => {
    const matchingNotas = termGrades.filter((nota) => nota.class_group_name === turma.name);
    const mediaTurma = matchingNotas.length
      ? matchingNotas.reduce((sum, nota) => sum + nota.average, 0) / matchingNotas.length
      : (turma.average_score ?? 0);
    const aprovadosTurma = matchingNotas.filter((nota) => nota.average >= 10).length;
    return {
      id: turma.id,
      nome: turma.name,
      curso: turma.course_name,
      director: "—",
      alunosActuais: turma.enrolled_count,
      mediaReal: mediaTurma,
      aproveitamento: matchingNotas.length
        ? Math.round((aprovadosTurma / matchingNotas.length) * 100)
        : null,
    };
  });

  const disciplinasRanking = subjects
    .map((subject) => ({
      id: subject.id,
      nome: subject.name,
      aprovacao: subject.approval_rate,
    }))
    .filter((subject) => subject.aprovacao != null)
    .sort((a, b) => (a.aprovacao ?? 0) - (b.aprovacao ?? 0));

  const pautaRows = termGrades.map((nota) => ({
    aluno: nota.student_name,
    turma: nota.class_group_name,
    disciplina: nota.subject_name,
    trimestre: nota.term_label,
    mac: nota.mac,
    npp: nota.npp,
    npt: nota.npt,
    media: Number(nota.average.toFixed(1)),
    resultado: nota.average >= 10 ? "Aprovado" : "Em recuperação",
  }));
  const pautaColumns: Array<{ label: string; value: (row: Record<string, CsvValue>) => CsvValue }> =
    [
      { label: "Aluno", value: (row) => row["aluno"] },
      { label: "Turma", value: (row) => row["turma"] },
      { label: "Disciplina", value: (row) => row["disciplina"] },
      { label: "Trimestre", value: (row) => row["trimestre"] },
      { label: "MAC", value: (row) => row["mac"] },
      { label: "NPP", value: (row) => row["npp"] },
      { label: "NPT", value: (row) => row["npt"] },
      { label: "Média", value: (row) => row["media"] },
      { label: "Resultado", value: (row) => row["resultado"] },
    ];
  const exportarPautaCsv = () => exportCsv("pauta-academica-filtrada", pautaColumns, pautaRows);
  const exportarPautaOficial = () => {
    const byClass = new Map<string, { course: string; total: number; approved: number }>();
    for (const row of pautaRows) {
      const key = String(row.turma || "—");
      const current = byClass.get(key) ?? {
        course: String(row.disciplina || "—"),
        total: 0,
        approved: 0,
      };
      current.total += 1;
      if (row.resultado === "Aprovado") current.approved += 1;
      byClass.set(key, current);
    }
    const academicYear =
      selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "";
    void issuePrintDocument({
      tipo: "Relatório académico",
      school: {
        name: school?.name ?? "Escola",
        directorName: school?.director_name,
        academicYear,
      },
      overlay: overlayServico({
        name: "Relatório académico",
        areaLabel: "Pedagógica",
        reference: `RAC-${pautaRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Mapa por turma",
            rows: [...byClass.entries()].map(([classGroup, row]) => ({
              label: classGroup,
              value: `${row.approved}/${row.total} aprovados`,
              note: row.course,
            })),
          },
          {
            title: "Pauta detalhada",
            rows: pautaRows.map((row) => ({
              label: `${row.aluno} · ${row.disciplina}`,
              value: `${row.media} · ${row.resultado}`,
              note: `${row.turma} · ${row.trimestre}`,
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "relatorio-academico-oficial",
          "Relatório de aproveitamento",
          {
            schoolName: school?.name ?? "Escola",
            academicYear,
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              String(pautaRows.length),
            ]),
          },
          pautaColumns,
          pautaRows,
        ),
    });
  };
  const exportarPautaPdf = () =>
    exportPdfTable(
      "pauta-academica-filtrada",
      "Pauta académica",
      pautaColumns,
      pautaRows,
      `Filtros: ${activeCount || "nenhum"} · ${selectedYearLabel}`,
    );

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Relatórios"
          title="Relatórios Académicos"
          description="Indicadores de aproveitamento, evolução das médias e desempenho comparado das turmas."
          actions={
            <>
              <DocHelpButton title="Navegação — Relatórios académicos" />
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarPautaCsv}
                disabled={!canRead || termGrades.length === 0}
              >
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarPautaPdf}
                disabled={!canRead || termGrades.length === 0}
              >
                <FileDown className="size-4" /> PDF
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarPautaOficial}
                disabled={!canRead || termGrades.length === 0}
              >
                <Award className="size-4" /> Oficial
              </Button>
              {sigeOn ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={exportarPautaCsv}
                  disabled={!canRead || termGrades.length === 0}
                >
                  <AppMark id="sige" className="size-4" /> SIGE
                </Button>
              ) : null}
              {whatsappOn ? (
                <Button variant="outline" className="gap-2" asChild>
                  <a
                    href={whatsappHref(
                      "",
                      `Relatório académico ${selectedYearLabel}: pauta pronta no SIGA.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                </Button>
              ) : null}
              {resendOn ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `Relatório académico ${selectedYearLabel}\n${termGrades.length} linhas de notas · média ${mediaGeral.toFixed(1)}`,
                    );
                    toast.success("Resumo copiado para e-mail Resend");
                  }}
                  disabled={!canRead || termGrades.length === 0}
                >
                  E-mail
                </Button>
              ) : null}
            </>
          }
        />

        <InstalledModuleTools
          module="pedagogica"
          onExport={(kind) => {
            if (kind === "sige_classes") exportarPautaCsv();
          }}
        />

        {!canRead ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center shadow-soft">
            <p className="font-semibold">Sem permissão para relatórios académicos</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Contacte a administração se precisar de acesso a pautas e indicadores.
            </p>
          </div>
        ) : workspaceQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar indicadores académicos…</p>
        ) : workspaceQuery.isError ? (
          <p className="text-sm text-destructive">
            {workspaceQuery.error instanceof Error
              ? workspaceQuery.error.message
              : "Não foi possível carregar os relatórios."}
          </p>
        ) : (
          <>
            <ListFilterBar
              values={filters}
              activeCount={activeCount}
              onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
              onReset={resetFilters}
              fields={[
                {
                  name: "q",
                  placeholder: "Pesquisar aluno, turma ou disciplina…",
                  "aria-label": "Pesquisar relatório académico",
                },
                {
                  name: "trimestre",
                  type: "select",
                  label: "Trimestre",
                  emptyValue: "todos",
                  options: [
                    { value: "todos", label: "Todos" },
                    { value: "1", label: "1º" },
                    { value: "2", label: "2º" },
                    { value: "3", label: "3º" },
                  ],
                },
                {
                  name: "turma",
                  type: "select",
                  label: "Turma",
                  emptyValue: "todas",
                  options: [
                    { value: "todas", label: "Todas" },
                    ...classGroups.map((group) => ({ value: group.name, label: group.name })),
                  ],
                },
                {
                  name: "resultado",
                  type: "select",
                  label: "Resultado",
                  emptyValue: "todos",
                  options: [
                    { value: "todos", label: "Todos" },
                    { value: "aprovados", label: "Aprovados" },
                    { value: "reprovados", label: "Reprovados" },
                  ],
                },
              ]}
            />
            {!gradesAvailable || !subjectsAvailable ? (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm">
                <p className="font-semibold">Migração académica incompleta</p>
                <p className="mt-1 text-muted-foreground">
                  Execute <code className="font-mono">supabase db push</code> para activar{" "}
                  <code className="font-mono">subjects</code> e{" "}
                  <code className="font-mono">term_grades</code>.
                </p>
              </div>
            ) : (
              <>
                <StatGrid
                  collapsible
                  storageKey="rel-academicos"
                  items={[
                    {
                      label: "Média geral",
                      value: termGrades.length ? mediaGeral.toFixed(1) : "—",
                      hint: "Escala 0 – 20",
                    },
                    {
                      label: "Aprovados",
                      value: termGrades.length ? `${taxaAprovados}%` : "—",
                      hint: `${aprovados} registos positivos`,
                    },
                    {
                      label: "Reprovados",
                      value: termGrades.length ? `${taxaReprovados}%` : "—",
                      hint: `${Math.max(termGrades.length - aprovados, 0)} registos em recuperação`,
                    },
                    {
                      label: "Assiduidade média",
                      value: assiduidadeMedia == null ? "—" : `${assiduidadeMedia}%`,
                      hint: "Com base nas matrículas activas",
                    },
                  ]}
                />

                <Suspense
                  fallback={
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="surface-card h-[280px] animate-pulse bg-muted/40" />
                      <div className="surface-card h-[280px] animate-pulse bg-muted/40" />
                    </div>
                  }
                >
                  <RelatoriosAcademicosCharts
                    aproveitamentoPorClasse={aproveitamentoPorClasse}
                    mediaPorTrimestre={mediaPorTrimestre}
                    hasTermGrades={termGrades.length > 0}
                  />
                </Suspense>

                <Panel title="Desempenho por turma" description="Ordenado pela média da turma">
                  {turmasComDados.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda não há turmas na escola.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Turma</TableHead>
                            <TableHead>Curso</TableHead>
                            <TableHead>Director de turma</TableHead>
                            <TableHead className="text-right">Alunos</TableHead>
                            <TableHead className="text-right">Média</TableHead>
                            <TableHead className="min-w-[140px]">Aproveitamento</TableHead>
                            <TableHead className="text-right">Classificação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...turmasComDados]
                            .sort((a, b) => b.mediaReal - a.mediaReal)
                            .map((t, i) => (
                              <TableRow key={t.id}>
                                <TableCell className="font-semibold">
                                  <span className="flex items-center gap-2">
                                    {i === 0 && t.mediaReal > 0 ? (
                                      <Award className="size-4 text-warning-foreground" />
                                    ) : null}
                                    {t.nome}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {t.curso}
                                </TableCell>
                                <TableCell>{t.director}</TableCell>
                                <TableCell className="text-right">{t.alunosActuais}</TableCell>
                                <TableCell className="text-right font-bold">
                                  {t.mediaReal > 0 ? t.mediaReal.toFixed(1) : "—"}
                                </TableCell>
                                <TableCell>
                                  {t.aproveitamento == null ? (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="h-2 w-full min-w-[64px] overflow-hidden rounded-full bg-secondary"
                                        role="img"
                                        aria-label={`Aproveitamento de ${t.aproveitamento}%`}
                                      >
                                        <div
                                          className={cn(
                                            "h-full rounded-full",
                                            t.aproveitamento >= 85
                                              ? "bg-success"
                                              : t.aproveitamento >= 75
                                                ? "bg-primary"
                                                : "bg-destructive",
                                          )}
                                          style={{ width: `${t.aproveitamento}%` }}
                                        />
                                      </div>
                                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {t.aproveitamento}%
                                      </span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {t.mediaReal > 0 ? (
                                    <span
                                      className={cn(
                                        badgeBase,
                                        t.mediaReal >= 15
                                          ? toneClass.success
                                          : t.mediaReal >= 13
                                            ? toneClass.info
                                            : toneClass.warning,
                                      )}
                                    >
                                      {t.mediaReal >= 15
                                        ? "Muito bom"
                                        : t.mediaReal >= 13
                                          ? "Bom"
                                          : "Suficiente"}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">Sem notas</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Panel>

                <Panel
                  title="Taxa de aprovação por disciplina"
                  description="Disciplinas com maior risco de reprovação"
                >
                  {disciplinasRanking.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sem taxas calculáveis — lance notas por disciplina primeiro.
                    </p>
                  ) : (
                    <ul className="space-y-4">
                      {disciplinasRanking.map((d) => (
                        <li key={d.id}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{d.nome}</span>
                            <span className="text-muted-foreground">{d.aprovacao}%</span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                (d.aprovacao ?? 0) >= 85
                                  ? "bg-success"
                                  : (d.aprovacao ?? 0) >= 75
                                    ? "bg-primary"
                                    : "bg-destructive",
                              )}
                              style={{ width: `${d.aprovacao ?? 0}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
