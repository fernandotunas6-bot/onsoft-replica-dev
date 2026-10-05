import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import type { EnrollmentStatus, ExamSeason } from "@/features/higher-ed/engine";
import { SEASON_LABEL, STATUS_LABEL } from "@/features/higher-ed/labels";
import { getUnitSheet, listLaunchableUnits, recordUnitResult } from "@/features/higher-ed/server";
import { toastActionError } from "@/lib/action-error-toast";
import { DocPathHelpButton } from "@/components/ui/doc-help-button";
import { DOC_PATHS } from "@/lib/ecosystem-urls";

export const Route = createFileRoute("/pedagogica_/pautas-superior")({
  head: () => ({
    meta: [
      { title: "Pautas do Ensino Superior · SIGA" },
      {
        name: "description",
        content: "Lançar frequência e exames por cadeira, época a época.",
      },
    ],
  }),
  component: UnitSheetsPage,
});

const SEASONS = Object.keys(SEASON_LABEL) as ExamSeason[];

function UnitSheetsPage() {
  const account = useCurrentAccount();
  const allowed =
    account.role === "Administrador" ||
    account.role === "Secretaria" ||
    account.role === "Professor";
  const fetchUnits = useServerFn(listLaunchableUnits);
  const units = useQuery({
    queryKey: ["higher-ed", "launchable-units"],
    enabled: allowed,
    queryFn: () => fetchUnits(),
  });
  const [choice, setChoice] = useState("");
  const selected = units.data?.find((unit) => unit.unitId === choice) ?? units.data?.[0] ?? null;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Pedagógica"
          title="Pautas do Ensino Superior"
          description="Lance a frequência e os exames de cada cadeira. As épocas disponíveis seguem o regulamento da instituição."
          icon={ClipboardList}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <DocPathHelpButton path={DOC_PATHS.sigaHigherEd} title="Manual do Ensino Superior" />
              {units.data?.length ? (
                <Select value={selected?.unitId ?? ""} onValueChange={setChoice}>
                  <SelectTrigger className="w-80" aria-label="Cadeira">
                    <SelectValue placeholder="Escolha a cadeira" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.data.map((unit) => (
                      <SelectItem key={unit.unitId} value={unit.unitId}>
                        {unit.programName} · {unit.semester}.º sem. · {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          }
        />
        {!account.profile.isLoading && !allowed ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              As pautas são lançadas pelos professores das cadeiras e pela secretaria.
            </p>
          </Panel>
        ) : units.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar cadeiras…</p>
        ) : units.isError ? (
          <Panel title="Não foi possível carregar">
            <p className="text-sm text-muted-foreground">Tente de novo dentro de instantes.</p>
          </Panel>
        ) : !selected ? (
          <EmptyState
            title="Sem cadeiras para lançar"
            description="Aparecem aqui as cadeiras dos planos curriculares que lecciona numa turma do curso. Se falta alguma, peça à secretaria para o atribuir à disciplina na turma."
          />
        ) : (
          <UnitSheet programId={selected.programId} unitId={selected.unitId} />
        )}
      </div>
    </AppShell>
  );
}

type Launch = {
  studentId: string;
  season: ExamSeason;
  frequency: string;
  exam: string;
  absence: string;
};

function UnitSheet({ programId, unitId }: { programId: string; unitId: string }) {
  const queryClient = useQueryClient();
  const fetchSheet = useServerFn(getUnitSheet);
  const launchResult = useServerFn(recordUnitResult);
  const queryKey = ["higher-ed", "unit-sheet", programId, unitId];
  const sheet = useQuery({
    queryKey,
    queryFn: () => fetchSheet({ data: { programId, unitId } }),
  });
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [filter, setFilter] = useState<ExamSeason | "todos">("todos");

  const record = useMutation({
    mutationFn: (current: Launch) => {
      const num = (value: string) => (value.trim() === "" ? null : Number(value));
      return launchResult({
        data: {
          programId,
          studentId: current.studentId,
          unitId,
          season: current.season,
          frequency: num(current.frequency),
          exam: num(current.exam),
          absencePercent: num(current.absence),
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(
        `Resultado: ${STATUS_LABEL[result.status as EnrollmentStatus] ?? result.status}${
          result.finalGrade !== null ? ` · ${result.finalGrade} valores` : ""
        }.`,
      );
      setLaunch(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toastActionError(error, "Não foi possível lançar."),
  });

  if (sheet.isLoading) return <p className="text-sm text-muted-foreground">A carregar pauta…</p>;
  if (sheet.isError || !sheet.data) {
    return (
      <Panel title="Não foi possível abrir a pauta">
        <p className="text-sm text-muted-foreground">
          {sheet.error instanceof Error ? sheet.error.message : "Tente de novo."}
        </p>
      </Panel>
    );
  }
  const { unit, regulation, rows } = sheet.data;
  const visible = filter === "todos" ? rows : rows.filter((row) => row.seasons[filter]);
  const pendingBySeason = SEASONS.map((season) => ({
    season,
    count: rows.filter((row) => row.seasons[season]).length,
  })).filter((item) => item.count > 0);

  return (
    <Panel
      title={`${unit.name} · ${unit.semester}.º semestre · ${unit.credits} créditos`}
      description={`Admissão a exame ≥ ${regulation.exam_admission_min} · dispensa ≥ ${
        regulation.exam_exemption_min || "—"
      } · aprovação ≥ ${regulation.passing_grade} · frequência vale ${Math.round(
        regulation.frequency_weight * 100,
      )}% na época normal${
        regulation.max_absence_percent ? ` · faltas até ${regulation.max_absence_percent}%` : ""
      }.`}
    >
      <div className="mb-3 flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link to="/pedagogica/pautas-superior/imprimir" search={{ programId, unitId }}>
            Imprimir pauta
          </Link>
        </Button>
      </div>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há estudantes inscritos nesta cadeira. A inscrição por cadeira é feita pela
          secretaria em Ensino Superior → Estudantes.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por época">
            <Button
              size="sm"
              variant={filter === "todos" ? "default" : "secondary"}
              onClick={() => setFilter("todos")}
            >
              Todos ({rows.length})
            </Button>
            {pendingBySeason.map(({ season, count }) => (
              <Button
                key={season}
                size="sm"
                variant={filter === season ? "default" : "secondary"}
                onClick={() => setFilter(season)}
              >
                {SEASON_LABEL[season]} ({count})
              </Button>
            ))}
          </div>
          <ul className="divide-y">
            {visible.map((row) => {
              const seasons = SEASONS.filter((season) => row.seasons[season]);
              const open = launch?.studentId === row.studentId ? launch : null;
              return (
                <li key={row.studentId} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.number ? `N.º ${row.number} · ` : ""}
                        {row.latest?.attempt ? `${row.latest.attempt}.ª inscrição` : ""}
                        {row.workerStudent ? " · Trabalhador-estudante" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.latest ? (
                        <Badge
                          variant={
                            row.latest.status === "aprovado" || row.latest.status === "dispensado"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {STATUS_LABEL[row.latest.status]}
                          {row.latest.finalGrade !== null ? ` · ${row.latest.finalGrade}` : ""}
                          {row.latest.season ? ` · ${SEASON_LABEL[row.latest.season]}` : ""}
                        </Badge>
                      ) : null}
                      {seasons.map((season) => (
                        <Button
                          key={season}
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setLaunch({
                              studentId: row.studentId,
                              season,
                              frequency: "",
                              exam: "",
                              absence: "",
                            })
                          }
                        >
                          {SEASON_LABEL[season]}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {open ? (
                    <form
                      className="grid gap-2 rounded-md border p-3 sm:grid-cols-4 sm:items-end"
                      onSubmit={(event) => {
                        event.preventDefault();
                        record.mutate(open);
                      }}
                    >
                      <p className="text-xs font-semibold sm:col-span-4">
                        {SEASON_LABEL[open.season]} — {row.name}
                      </p>
                      {open.season === "frequencia" ? (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`freq-${row.studentId}`}>Média de frequência</Label>
                            <Input
                              id={`freq-${row.studentId}`}
                              type="number"
                              min={0}
                              max={20}
                              step={0.1}
                              required
                              value={open.frequency}
                              onChange={(e) => setLaunch({ ...open, frequency: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`abs-${row.studentId}`}>Faltas (%)</Label>
                            <Input
                              id={`abs-${row.studentId}`}
                              type="number"
                              min={0}
                              max={100}
                              value={open.absence}
                              onChange={(e) => setLaunch({ ...open, absence: e.target.value })}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1">
                          <Label htmlFor={`exam-${row.studentId}`}>Nota do exame</Label>
                          <Input
                            id={`exam-${row.studentId}`}
                            type="number"
                            min={0}
                            max={20}
                            step={0.1}
                            required
                            value={open.exam}
                            onChange={(e) => setLaunch({ ...open, exam: e.target.value })}
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" type="submit" disabled={record.isPending}>
                          {record.isPending ? "A lançar…" : "Lançar"}
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setLaunch(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
