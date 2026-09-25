import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Stethoscope } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { diagnoseErrorReport, type ErrorDiagnosis } from "@/features/ai-assist/ai-assist.functions";
import { useCurrentAccount } from "@/features/auth/use-current-account";

export const Route = createFileRoute("/configuracoes_/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico de erros · SIGA Plus" },
      {
        name: "description",
        content:
          "Descreva um erro e cole os registos: a IA indica causas prováveis e como corrigir.",
      },
      { property: "og:title", content: "Diagnóstico de erros · SIGA Plus" },
      {
        property: "og:description",
        content: "Diagnóstico de erros com IA para administradores escolares.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiagnosticPage,
});

function collectBrowserContext() {
  if (typeof window === "undefined") return "";
  return [
    `Navegador: ${navigator.userAgent}`,
    `Ecrã: ${window.innerWidth}x${window.innerHeight}`,
    `Ligação: ${navigator.onLine ? "online" : "offline"}`,
    `Data: ${new Date().toISOString()}`,
  ].join("\n");
}

const likelihoodTone: Record<string, string> = {
  alta: "text-destructive",
  média: "text-warning-foreground",
  baixa: "text-muted-foreground",
};

function DiagnosticPage() {
  const account = useCurrentAccount();
  const isAdmin = account.role === "Administrador";
  const [page, setPage] = useState("");
  const [report, setReport] = useState("");
  const [logs, setLogs] = useState("");
  const diagnose = useServerFn(diagnoseErrorReport);
  const mutation = useMutation<ErrorDiagnosis, Error>({
    mutationFn: () =>
      diagnose({
        data: { page, report, logs: `${logs}\n\n--- Contexto ---\n${collectBrowserContext()}` },
      }),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Sistema"
          title="Diagnóstico de erros"
          description="Descreva o que aconteceu e cole as mensagens de erro. A IA indica as causas mais prováveis e o que fazer."
          icon={Stethoscope}
        />
        {!account.profile.isLoading && !isAdmin ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              Só administradores da escola podem usar o diagnóstico.
            </p>
          </Panel>
        ) : (
          <Panel title="Relatório de erro">
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
            >
              <div className="grid gap-1.5 sm:max-w-md">
                <Label htmlFor="diag-pagina">Página onde aconteceu</Label>
                <Input
                  id="diag-pagina"
                  value={page}
                  maxLength={200}
                  onChange={(e) => setPage(e.target.value)}
                  placeholder="Ex.: Caixa e Pagamentos"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="diag-relatorio">O que aconteceu?</Label>
                <Textarea
                  id="diag-relatorio"
                  rows={4}
                  required
                  minLength={10}
                  maxLength={4000}
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  placeholder="Ex.: Ao registar um pagamento aparece 'Não foi possível guardar' e o recibo não é emitido."
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="diag-registos">Registos / mensagens de erro (opcional)</Label>
                <Textarea
                  id="diag-registos"
                  rows={8}
                  maxLength={20000}
                  className="font-mono text-xs"
                  value={logs}
                  onChange={(e) => setLogs(e.target.value)}
                  placeholder="Cole aqui a mensagem de erro ou registos copiados."
                />
              </div>
              <div>
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={mutation.isPending || report.trim().length < 10}
                >
                  <Stethoscope className="size-4" />
                  {mutation.isPending ? "A analisar…" : "Diagnosticar"}
                </Button>
              </div>
              {mutation.error ? (
                <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                  <AlertTriangle className="size-4" /> {mutation.error.message}
                </p>
              ) : null}
            </form>
          </Panel>
        )}

        {mutation.data ? (
          <Panel title="Diagnóstico" description={mutation.data.summary}>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Causas prováveis
                </p>
                <ul className="mt-2 space-y-3">
                  {mutation.data.causes.map((c, i) => (
                    <li key={i} className="rounded-xl border border-border p-3">
                      <p className="text-sm font-medium">
                        {c.title}{" "}
                        <span className={likelihoodTone[c.likelihood] ?? ""}>
                          · probabilidade {c.likelihood}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{c.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Como corrigir
                </p>
                <ul className="mt-2 space-y-3">
                  {mutation.data.fixes.map((f, i) => (
                    <li key={i} className="rounded-xl border border-border p-3">
                      <p className="text-sm font-medium">{f.title}</p>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                        {f.steps?.map((s, j) => (
                          <li key={j}>{s}</li>
                        ))}
                      </ol>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Diagnóstico gerado por IA — pode não ser exacto.
            </p>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
