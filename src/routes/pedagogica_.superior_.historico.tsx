// style-check: route-exempt - documento imprimível (histórico académico do Ensino Superior).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { LogoChip } from "@/components/ui/logo-chip";
import { SEASON_LABEL, STATUS_LABEL } from "@/features/higher-ed/labels";
import { getStudentTranscript } from "@/features/higher-ed/server";

const searchSchema = z.object({
  programId: z.string().uuid(),
  studentId: z.string().uuid(),
});

export const Route = createFileRoute("/pedagogica_/superior_/historico")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Histórico académico · SIGA" },
      {
        name: "description",
        content: "Histórico académico do estudante do Ensino Superior, pronto a imprimir.",
      },
    ],
  }),
  component: TranscriptPage,
});

const STATE_LABEL = {
  concluida: "Aprovada",
  creditada: "Creditada",
  em_curso: "Em curso",
  por_fazer: "Por fazer",
} as const;

function TranscriptPage() {
  const { programId, studentId } = Route.useSearch();
  const fetchTranscript = useServerFn(getStudentTranscript);
  const transcript = useQuery({
    queryKey: ["higher-ed", "transcript", programId, studentId],
    queryFn: () => fetchTranscript({ data: { programId, studentId } }),
  });
  const data = transcript.data;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[900px] space-y-4 px-4 py-6 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" asChild>
            <Link to="/pedagogica/superior">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Ensino Superior
            </Link>
          </Button>
          <Button onClick={() => window.print()} disabled={!data}>
            <Printer className="mr-2 size-4" aria-hidden />
            Imprimir / Guardar PDF
          </Button>
        </div>
        {transcript.isLoading ? (
          <p className="text-sm text-muted-foreground">A preparar o histórico…</p>
        ) : !data ? (
          <p className="text-sm text-destructive">
            {transcript.error instanceof Error
              ? transcript.error.message
              : "Não foi possível abrir o histórico."}
          </p>
        ) : (
          <article className="rounded-lg border bg-background p-6 text-sm print:border-0 print:p-0">
            <header className="flex items-start gap-4 border-b pb-4">
              {data.school.logoUrl ? (
                <LogoChip src={data.school.logoUrl} alt="" size="md" label={data.school.name} />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">{data.school.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[data.school.nif ? `NIF ${data.school.nif}` : null, data.school.address]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </header>
            <h1 className="mt-4 text-center text-lg font-bold uppercase tracking-wide">
              Histórico académico
            </h1>
            <dl className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <div>
                <dt className="inline text-muted-foreground">Estudante: </dt>
                <dd className="inline font-semibold">{data.student.name}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">N.º: </dt>
                <dd className="inline">{data.student.number ?? "—"}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Curso: </dt>
                <dd className="inline font-semibold">{data.program.name}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Documento: </dt>
                <dd className="inline">{data.student.document ?? "—"}</dd>
              </div>
            </dl>
            <table className="mt-4 w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-1.5 pr-2">
                    Sem.
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Cadeira
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right">
                    Créditos
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right">
                    Nota
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Época
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Ano lectivo
                  </th>
                  <th scope="col" className="py-1.5">
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.unit.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 tabular-nums">{line.unit.semester}.º</td>
                    <td className="py-1.5 pr-2">{line.unit.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{line.unit.credits}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                      {line.grade ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2">
                      {line.state === "concluida" && line.season ? SEASON_LABEL[line.season] : "—"}
                    </td>
                    <td className="py-1.5 pr-2">{line.yearName ?? "—"}</td>
                    <td className="py-1.5">
                      {line.state === "em_curso" && line.lastStatus
                        ? STATUS_LABEL[line.lastStatus]
                        : STATE_LABEL[line.state]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 grid gap-x-6 gap-y-1 border-t pt-3 sm:grid-cols-2">
              <div>
                <dt className="inline text-muted-foreground">Créditos obtidos: </dt>
                <dd className="inline font-semibold">
                  {data.progress.creditsEarned} de {data.progress.creditsTotal} (
                  {data.progress.percent}%)
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Média ponderada: </dt>
                <dd className="inline font-semibold">
                  {data.progress.average === null ? "—" : `${data.progress.average} valores`}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Situação: </dt>
                <dd className="inline font-semibold">
                  {data.progress.completed
                    ? "Concluiu o curso"
                    : data.progress.finalist
                      ? `Finalista (${data.progress.pendingUnits} cadeira(s) em falta)`
                      : `${data.progress.curricularYear}.º ano curricular`}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Nota mínima de aprovação: </dt>
                <dd className="inline">{data.passingGrade} valores</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">
              As cadeiras creditadas contam créditos mas não entram na média. Emitido em{" "}
              {new Date(data.issuedAt).toLocaleDateString("pt-AO")}.
            </p>
            <div className="mt-12 grid gap-10 sm:grid-cols-2">
              <div className="border-t pt-1 text-center text-xs">A Secretaria Académica</div>
              <div className="border-t pt-1 text-center text-xs">
                {data.school.director ?? "A Direcção"}
              </div>
            </div>
          </article>
        )}
      </div>
    </AppShell>
  );
}
