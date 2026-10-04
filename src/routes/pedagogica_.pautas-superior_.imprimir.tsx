// style-check: route-exempt - documento imprimível (pauta de uma cadeira do Ensino Superior).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { LogoChip } from "@/components/ui/logo-chip";
import { SEASON_LABEL, STATUS_LABEL } from "@/features/higher-ed/labels";
import { getUnitSheet } from "@/features/higher-ed/server";

const searchSchema = z.object({
  programId: z.string().uuid(),
  unitId: z.string().uuid(),
});

export const Route = createFileRoute("/pedagogica_/pautas-superior_/imprimir")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Pauta da cadeira · SIGA" },
      {
        name: "description",
        content: "Pauta de uma cadeira do Ensino Superior, pronta a imprimir.",
      },
    ],
  }),
  component: UnitSheetPrintPage,
});

function UnitSheetPrintPage() {
  const { programId, unitId } = Route.useSearch();
  const fetchSheet = useServerFn(getUnitSheet);
  const sheet = useQuery({
    queryKey: ["higher-ed", "unit-sheet", programId, unitId],
    queryFn: () => fetchSheet({ data: { programId, unitId } }),
  });
  const data = sheet.data;
  const approved = data?.rows.filter(
    (row) => row.latest?.status === "aprovado" || row.latest?.status === "dispensado",
  ).length;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[900px] space-y-4 px-4 py-6 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" asChild>
            <Link to="/pedagogica/pautas-superior">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Pautas
            </Link>
          </Button>
          <Button onClick={() => window.print()} disabled={!data}>
            <Printer className="mr-2 size-4" aria-hidden />
            Imprimir / Guardar PDF
          </Button>
        </div>
        {sheet.isLoading ? (
          <p className="text-sm text-muted-foreground">A preparar a pauta…</p>
        ) : !data ? (
          <p className="text-sm text-destructive">
            {sheet.error instanceof Error ? sheet.error.message : "Não foi possível abrir a pauta."}
          </p>
        ) : (
          <article className="rounded-lg border bg-background p-6 text-sm print:border-0 print:p-0">
            <header className="flex items-center gap-4 border-b pb-4">
              {data.school.logoUrl ? (
                <LogoChip src={data.school.logoUrl} alt="" size="md" label={data.school.name} />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">{data.school.name}</p>
                <p className="text-xs text-muted-foreground">
                  {data.program.name}
                  {data.yearName ? ` · Ano lectivo ${data.yearName}` : ""}
                </p>
              </div>
            </header>
            <h1 className="mt-4 text-center text-lg font-bold uppercase tracking-wide">Pauta</h1>
            <p className="text-center text-sm">
              {data.unit.name} · {data.unit.semester}.º semestre · {data.unit.credits} créditos
            </p>
            <table className="mt-4 w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-1.5 pr-2">
                    #
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    N.º
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Nome
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right">
                    Nota
                  </th>
                  <th scope="col" className="py-1.5 pr-2">
                    Época
                  </th>
                  <th scope="col" className="py-1.5">
                    Resultado
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={row.studentId} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 tabular-nums">{index + 1}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{row.number ?? "—"}</td>
                    <td className="py-1.5 pr-2">{row.name}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                      {row.latest?.finalGrade ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2">
                      {row.latest?.season ? SEASON_LABEL[row.latest.season] : "—"}
                    </td>
                    <td className="py-1.5">
                      {row.latest
                        ? row.latest.status === "inscrito" && row.latest.season === "frequencia"
                          ? "Admitido a exame"
                          : STATUS_LABEL[row.latest.status]
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              {data.rows.length} estudante(s) · {approved} aprovado(s) · aprovação ≥{" "}
              {data.regulation.passing_grade} valores · emitida em{" "}
              {new Date().toLocaleDateString("pt-AO")}.
            </p>
            <div className="mt-12 grid gap-10 sm:grid-cols-2">
              <div className="border-t pt-1 text-center text-xs">O Docente</div>
              <div className="border-t pt-1 text-center text-xs">A Secretaria Académica</div>
            </div>
          </article>
        )}
      </div>
    </AppShell>
  );
}
