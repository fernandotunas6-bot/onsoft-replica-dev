// style-check: route-exempt - documento imprimível (certificado de conclusão do Ensino Superior).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { LogoChip } from "@/components/ui/logo-chip";
import { finalClassification } from "@/features/higher-ed/engine";
import { getStudentTranscript } from "@/features/higher-ed/server";
import { gradeInWords } from "@/lib/grade-words";

const searchSchema = z.object({
  programId: z.string().uuid(),
  studentId: z.string().uuid(),
});

export const Route = createFileRoute("/pedagogica_/superior_/certificado")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Certificado de conclusão · SIGA" },
      {
        name: "description",
        content: "Certificado de conclusão de curso do Ensino Superior, pronto a imprimir.",
      },
    ],
  }),
  component: CertificatePage,
});

function CertificatePage() {
  const { programId, studentId } = Route.useSearch();
  const fetchTranscript = useServerFn(getStudentTranscript);
  const transcript = useQuery({
    queryKey: ["higher-ed", "transcript", programId, studentId],
    queryFn: () => fetchTranscript({ data: { programId, studentId } }),
  });
  const data = transcript.data;
  // Decreto 257/25: classificação final inteira (10–20) com menção qualitativa.
  const final = data?.progress.completed ? finalClassification(data.progress.average) : null;
  const completed = Boolean(final);
  // Ano lectivo de conclusão: o mais recente entre as cadeiras feitas.
  const lastYear = data?.lines
    .map((line) => line.yearName)
    .filter((name): name is string => Boolean(name))
    .sort()
    .at(-1);

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
          <Button onClick={() => window.print()} disabled={!completed}>
            <Printer className="mr-2 size-4" aria-hidden />
            Imprimir / Guardar PDF
          </Button>
        </div>
        {transcript.isLoading ? (
          <p className="text-sm text-muted-foreground">A preparar o certificado…</p>
        ) : !data ? (
          <p className="text-sm text-destructive">
            {transcript.error instanceof Error
              ? transcript.error.message
              : "Não foi possível abrir o certificado."}
          </p>
        ) : !completed ? (
          <p className="text-sm text-muted-foreground">
            {data.student.name} ainda não concluiu o curso: faltam {data.progress.pendingUnits}{" "}
            cadeira(s). O certificado fica disponível quando todas as cadeiras do plano estiverem
            aprovadas ou creditadas.
          </p>
        ) : (
          <article className="rounded-lg border bg-background p-10 text-sm leading-relaxed print:border-0 print:p-8">
            <header className="flex flex-col items-center gap-2 text-center">
              {data.school.logoUrl ? (
                <LogoChip src={data.school.logoUrl} alt="" size="md" label={data.school.name} />
              ) : null}
              <p className="text-base font-bold uppercase">{data.school.name}</p>
              {data.school.nif ? (
                <p className="text-xs text-muted-foreground">NIF {data.school.nif}</p>
              ) : null}
            </header>
            <h1 className="mt-8 text-center text-xl font-bold uppercase tracking-widest">
              Certificado
            </h1>
            <p className="mt-8 text-justify">
              Certifica-se que <strong>{data.student.name}</strong>
              {data.student.document ? (
                <>, portador(a) do documento n.º {data.student.document}</>
              ) : null}
              {data.student.number ? <>, estudante n.º {data.student.number}</> : null}, concluiu o
              curso de <strong>{data.program.name}</strong>
              {lastYear ? <> no ano lectivo de {lastYear}</> : null}, tendo obtido{" "}
              {data.progress.creditsEarned} créditos, com a classificação final de{" "}
              <strong>{gradeInWords(final!.value).text}</strong>, com a menção de{" "}
              <strong>{final!.mention}</strong>.
            </p>
            <p className="mt-4 text-justify">
              A classificação final é a média das cadeiras do plano curricular ponderada pelos
              respectivos créditos, arredondada às unidades (Decreto Presidencial n.º 257/25); as
              cadeiras creditadas contam créditos mas não entram na média. Por ser verdade, passa-se
              o presente certificado.
            </p>
            <p className="mt-8 text-right">
              {new Date(data.issuedAt).toLocaleDateString("pt-AO", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <div className="mt-16 grid gap-10 sm:grid-cols-2">
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
