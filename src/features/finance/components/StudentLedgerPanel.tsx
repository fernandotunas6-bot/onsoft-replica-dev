import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { ListPaginationBar } from "@/components/filters/ListPaginationBar";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { MobileErrorState } from "@/components/mobile/states";
import { EntityListSkeleton } from "@/components/mobile/skeletons";
import { usePersistedListFilters } from "@/lib/list-filters";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { exportCsv } from "@/lib/export-csv";
import { kwanza } from "@/lib/currency";
import { schoolTodayIso } from "@/lib/school-date";
import { toast } from "@/lib/toast";
import { listStudentLedger } from "../student-ledger-server";
import { issueTuitionBatch, type TuitionBatchResult } from "../server";
import { studentBalanceState } from "../student-ledger";

const defaults = { q: "", turma: "", classe: "", curso: "", nivel: "", estado: "" };

export function StudentLedgerPanel({ blocked }: { blocked: boolean }) {
  const { school, selectedYearId, selectedYearLabel } = useSchoolSettings();
  // A mudança de escola/ano desmonta selecção, paginação e resultado do lote.
  return (
    <Ledger
      key={`${school?.id}:${selectedYearId}`}
      schoolId={school?.id ?? ""}
      yearId={selectedYearId}
      yearLabel={selectedYearLabel}
      blocked={blocked}
    />
  );
}

function Ledger({
  schoolId,
  yearId,
  yearLabel,
  blocked,
}: {
  schoolId: string;
  yearId: string | null;
  yearLabel: string;
  blocked: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["finance", "student-ledger", schoolId, yearId],
    queryFn: () => listStudentLedger({ data: { academicYearId: yearId! } }),
    enabled: Boolean(schoolId && yearId),
    staleTime: 30_000,
  });
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    `finance-student-ledger:${schoolId}:${yearId}`,
    defaults,
    { persistUrl: false },
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TuitionBatchResult | null>(null);
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const q = filters.q.trim().toLocaleLowerCase("pt");
        return (
          (!q || `${row.name} ${row.number}`.toLocaleLowerCase("pt").includes(q)) &&
          (!filters.turma || row.classGroupId === filters.turma) &&
          (!filters.classe || row.gradeId === filters.classe) &&
          (!filters.curso || row.programId === filters.curso) &&
          (!filters.nivel || row.levelId === filters.nivel) &&
          (!filters.estado ||
            (filters.estado === "sem"
              ? !row.invoiceCount
              : filters.estado === "pago"
                ? row.invoiceCount > 0 && row.outstanding === 0
                : filters.estado === "parcial"
                  ? row.paid > 0 && row.outstanding > 0
                  : filters.estado === "vencido"
                    ? row.overdue > 0
                    : row.outstanding > 0))
        );
      }),
    [rows, filters],
  );
  type Row = (typeof rows)[number];
  const options = (id: keyof Row, label: keyof Row, all: string) => [
    { value: "", label: all },
    ...[
      ...new Map(
        rows
          .filter((r) => r[id])
          .map((r) => [String(r[id]), { value: String(r[id]), label: String(r[label]) }]),
      ).values(),
    ].sort((a, b) => a.label.localeCompare(b.label, "pt")),
  ];
  const selectedRows = filtered.filter((row) => selected.includes(row.studentId));
  const selectedClass = selectedRows[0]?.classGroupId;
  const canIssue =
    !blocked &&
    !query.isFetching &&
    Boolean(selectedClass) &&
    selectedRows.length > 0 &&
    selectedRows.length <= 60 &&
    selectedRows.every((row) => row.active && row.classGroupId === selectedClass);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const visibleIds = visible.map((row) => row.studentId);
  const pageSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const pageSelection = [...new Set([...selected, ...visibleIds])];
  const selectedDebtors = selectedRows.filter((row) => row.outstanding > 0);
  const selectedDebt =
    selectedDebtors.reduce((sum, row) => sum + Math.round(row.outstanding * 100), 0) / 100;
  const changeFilter = (name: string, value: string) => {
    setFilter(name as keyof typeof filters, value);
    setSelected([]);
    setPage(1);
    setResult(null);
  };
  const totals = filtered.reduce(
    (sum, row) => ({
      paid: sum.paid + row.paid,
      outstanding: sum.outstanding + row.outstanding,
      overdue: sum.overdue + row.overdue,
    }),
    { paid: 0, outstanding: 0, overdue: 0 },
  );
  return (
    <Panel
      title="Situação financeira dos alunos"
      description="Ano seleccionado · valores de facturas e recibos confirmados"
    >
      <ListFilterBar
        values={filters}
        activeCount={activeCount}
        onChange={changeFilter}
        onReset={() => {
          resetFilters();
          setSelected([]);
          setPage(1);
          setResult(null);
        }}
        fields={[
          { name: "q", placeholder: "Nome ou processo…", "aria-label": "Pesquisar aluno" },
          {
            name: "nivel",
            label: "Nível",
            type: "select",
            options: options("levelId", "levelName", "Todos os níveis"),
          },
          {
            name: "curso",
            label: "Curso",
            type: "select",
            options: options("programId", "programName", "Todos os cursos"),
          },
          {
            name: "classe",
            label: "Classe",
            type: "select",
            options: options("gradeId", "gradeName", "Todas as classes"),
          },
          {
            name: "turma",
            label: "Turma",
            type: "select",
            options: options("classGroupId", "className", "Todas as turmas"),
          },
          {
            name: "estado",
            label: "Situação",
            type: "select",
            options: [
              { value: "", label: "Todas" },
              { value: "pago", label: "Pago" },
              { value: "parcial", label: "Pago em parte" },
              { value: "divida", label: "Com dívida" },
              { value: "vencido", label: "Dívida vencida" },
              { value: "sem", label: "Sem facturas" },
            ],
          },
        ]}
      />
      {!yearId ? (
        <p className="p-4 text-sm">Seleccione um ano lectivo.</p>
      ) : query.isPending ? (
        <EntityListSkeleton rows={4} />
      ) : query.isError ? (
        <MobileErrorState
          what="a lista financeira"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 p-3 text-sm" aria-live="polite">
            <span>
              {filtered.length} alunos · Pago: {kwanza(totals.paid)} · Dívida:{" "}
              {kwanza(totals.outstanding)} · Vencida: {kwanza(totals.overdue)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!filtered.length}
              onClick={() =>
                exportCsv(
                  "situacao-financeira-alunos",
                  [
                    { label: "Processo", value: (r: Row) => r.number },
                    { label: "Aluno", value: (r: Row) => r.name },
                    { label: "Nível", value: (r: Row) => r.levelName },
                    { label: "Curso", value: (r: Row) => r.programName },
                    { label: "Classe", value: (r: Row) => r.gradeName },
                    { label: "Turma", value: (r: Row) => r.className },
                    { label: "Facturado (Kz)", value: (r: Row) => r.billed },
                    { label: "Pago (Kz)", value: (r: Row) => r.paid },
                    { label: "Dívida (Kz)", value: (r: Row) => r.outstanding },
                    { label: "Vencida (Kz)", value: (r: Row) => r.overdue },
                    { label: "Situação", value: (r: Row) => studentBalanceState(r).label },
                  ],
                  filtered,
                )
              }
            >
              Exportar lista
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                !visible.length || query.isFetching || (!pageSelected && pageSelection.length > 60)
              }
              onClick={() =>
                setSelected((old) =>
                  pageSelected
                    ? old.filter((id) => !visibleIds.includes(id))
                    : [...new Set([...old, ...visibleIds])],
                )
              }
            >
              {pageSelected ? "Desmarcar página" : "Seleccionar página"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedDebtors.length || query.isFetching}
              onClick={() =>
                exportCsv(
                  `cobrancas-seleccionadas-${schoolTodayIso()}`,
                  [
                    { label: "Ano lectivo", value: () => yearLabel },
                    { label: "Data de conferência", value: () => schoolTodayIso() },
                    { label: "Processo", value: (r: Row) => r.number },
                    { label: "Aluno", value: (r: Row) => r.name },
                    { label: "Nível", value: (r: Row) => r.levelName },
                    { label: "Curso", value: (r: Row) => r.programName },
                    { label: "Classe", value: (r: Row) => r.gradeName },
                    { label: "Turma", value: (r: Row) => r.className },
                    { label: "Dívida total (Kz)", value: (r: Row) => r.outstanding },
                    { label: "Dívida vencida (Kz)", value: (r: Row) => r.overdue },
                    { label: "Pago (Kz)", value: (r: Row) => r.paid },
                    { label: "Matrícula", value: (r: Row) => (r.active ? "Activa" : "Inactiva") },
                  ],
                  selectedDebtors,
                )
              }
            >
              Exportar cobranças ({selectedDebtors.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected([])}
              disabled={!selected.length}
            >
              Limpar selecção ({selectedRows.length})
            </Button>
            <QuickFormModal
              title="Emitir propinas dos seleccionados"
              description={`${selectedRows.length} alunos. Um lote por turma, até 60 alunos activos. As propinas já emitidas para o mês não se repetem.`}
              submitLabel="Emitir propinas"
              fields={[{ name: "vencimento", label: "Vencimento", type: "date" }]}
              onSubmit={async (values) => {
                if (!canIssue || !yearId || !selectedClass)
                  throw new Error("Reveja a selecção antes de emitir.");
                const response = await issueTuitionBatch({
                  data: {
                    classGroupId: selectedClass,
                    academicYearId: yearId,
                    studentIds: selectedRows.map((r) => r.studentId),
                    dueOn: values.vencimento ?? "",
                  },
                });
                setResult(response);
                setSelected([]);
                await queryClient.invalidateQueries({ queryKey: ["finance"] });
                const message = `${response.issued.length} emitidas · ${response.skipped.length} já existentes · ${response.failed.length} com erro`;
                if (response.failed.length) toast.warning(message);
                else toast.success(message);
              }}
              trigger={(open) => (
                <Button size="sm" disabled={!canIssue} onClick={open}>
                  Emitir propinas ({selectedRows.length})
                </Button>
              )}
            />
          </div>
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            Seleccione até 60 alunos. Para emitir propinas, escolha alunos activos da mesma turma. A
            exportação de cobranças inclui apenas os seleccionados com dívida e não envia mensagens.
            Para receber, abra as facturas do aluno. Sem facturas não significa pago.
          </p>
          {selectedDebtors.length ? (
            <p className="px-3 pb-3 text-sm" role="status">
              Dívida dos seleccionados: {kwanza(selectedDebt)} · {selectedDebtors.length} alunos
            </p>
          ) : null}
          {result ? (
            <div role="status" className="p-3 text-sm">
              <p>
                {result.issued.length} emitidas · {result.skipped.length} já existentes ·{" "}
                {result.failed.length} com erro
              </p>
              {result.failed.map((failure) => (
                <p key={failure.studentId}>
                  {rows.find((r) => r.studentId === failure.studentId)?.name ?? "Aluno"}:{" "}
                  {failure.reason}
                </p>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Situação financeira dos alunos no ano seleccionado
              </caption>
              <thead>
                <tr>
                  {[
                    "Seleccionar",
                    "Aluno",
                    "Turma / curso / nível",
                    "Pago",
                    "Dívida",
                    "Vencida",
                    "Situação",
                  ].map((label) => (
                    <th key={label} scope="col" className="p-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const state = studentBalanceState(row);
                  return (
                    <tr key={row.studentId} className="border-t border-border">
                      <td className="p-3">
                        <Checkbox
                          aria-label={`Seleccionar ${row.name}`}
                          checked={selected.includes(row.studentId)}
                          disabled={!selected.includes(row.studentId) && selected.length >= 60}
                          onCheckedChange={(checked) =>
                            setSelected((old) =>
                              checked === true
                                ? [...new Set([...old, row.studentId])]
                                : old.filter((id) => id !== row.studentId),
                            )
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Link
                          to="/faturas"
                          search={{ aluno: row.studentId }}
                          className="text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {row.number}
                          {!row.active ? " · Matrícula inactiva" : ""}
                        </p>
                      </td>
                      <td className="p-3">
                        {row.className}
                        <p className="text-xs text-muted-foreground">
                          {row.gradeName} · {row.programName} · {row.levelName}
                        </p>
                      </td>
                      <td className="p-3 whitespace-nowrap">{kwanza(row.paid)}</td>
                      <td className="p-3 whitespace-nowrap">{kwanza(row.outstanding)}</td>
                      <td className="p-3 whitespace-nowrap">{kwanza(row.overdue)}</td>
                      <td className="p-3">
                        <StatusBadge status={state.status} label={state.label} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length ? (
            <p className="p-4 text-sm">Nenhum aluno corresponde aos filtros.</p>
          ) : null}
          <ListPaginationBar
            page={currentPage}
            pageSize={25}
            totalItems={filtered.length}
            onPageChange={setPage}
          />
        </>
      )}
    </Panel>
  );
}
