import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, GraduationCap, Network, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAlumni } from "@/features/alumni/server";
import { getAlumniDocumentWorkspace } from "@/features/alumni/documents";

export const Route = createFileRoute("/alumni/documents")({
  head: () => ({ meta: [{ title: "Documentos Alumni · SIGA" }] }),
  component: AlumniDocumentsPage,
});

const statusLabels: Record<string, string> = {
  submitted: "Submetido",
  in_review: "Em análise",
  approved: "Aprovado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
};

function AlumniDocumentsPage() {
  const [alumniId, setAlumniId] = useState("");
  const alumniQuery = useQuery({
    queryKey: ["alumni", "documents", "directory"],
    queryFn: () => listAlumni({ data: { limit: 200, offset: 0 } }),
  });
  const workspaceQuery = useQuery({
    queryKey: ["alumni", "documents", alumniId],
    queryFn: () => getAlumniDocumentWorkspace({ data: { alumniId } }),
    enabled: Boolean(alumniId),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <ShieldCheck className="size-3.5" /> Fonte académica oficial
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight">
                Documentos & Certificados Alumni
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Consulta os pedidos do antigo aluno directamente no módulo central de Documentos.
                Nenhum certificado ou histórico é duplicado no domínio Alumni.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/alumni"
                className="inline-flex h-10 items-center rounded-xl border border-input px-4 text-sm font-medium"
              >
                <Network className="mr-2 size-4" />
                Rede Alumni
              </Link>
              <Link
                to="/documentos"
                className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <FileCheck2 className="mr-2 size-4" />
                Abrir Documentos
              </Link>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Seleccionar antigo aluno</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={alumniId}
              onChange={(event) => setAlumniId(event.target.value)}
              className="h-11 w-full max-w-xl rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">Seleccionar Alumni…</option>
              {(alumniQuery.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name} · {row.student_number}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {!alumniId ? null : workspaceQuery.isLoading ? (
          <Card>
            <CardContent className="p-8 text-sm text-muted-foreground">
              A carregar documentos…
            </CardContent>
          </Card>
        ) : workspaceQuery.data ? (
          <>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{workspaceQuery.data.alumni.fullName}</h2>
                  <p className="text-sm text-muted-foreground">
                    Processo {workspaceQuery.data.alumni.studentNumber} ·{" "}
                    {workspaceQuery.data.alumni.graduationCourse || "Curso por actualizar"}
                    {workspaceQuery.data.alumni.graduationYear
                      ? ` · Conclusão ${workspaceQuery.data.alumni.graduationYear}`
                      : ""}
                  </p>
                </div>
                <GraduationCap className="size-7 text-primary" />
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de pedidos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {workspaceQuery.data.requests.length ? (
                    workspaceQuery.data.requests.map((request) => (
                      <div key={request.id} className="rounded-2xl border border-border/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{request.templateName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {request.documentType || "Documento académico"}
                            </p>
                          </div>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold">
                            {statusLabels[request.status] || request.status}
                          </span>
                        </div>
                        {request.purpose ? (
                          <p className="mt-3 text-sm text-muted-foreground">{request.purpose}</p>
                        ) : null}
                        <p className="mt-3 text-[11px] text-muted-foreground">
                          Pedido em {new Date(request.createdAt).toLocaleDateString("pt-AO")}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ainda não existem pedidos de documento para este Alumni.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Modelos disponíveis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {workspaceQuery.data.availableTemplates.map((template) => (
                    <div key={template.id} className="rounded-xl border border-border/60 p-3">
                      <p className="text-sm font-semibold">{template.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {template.document_type || "Documento institucional"}
                      </p>
                    </div>
                  ))}
                  <Link
                    to="/documentos"
                    className="mt-3 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    <FileCheck2 className="mr-2 size-4" />
                    Emitir no módulo Documentos
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
