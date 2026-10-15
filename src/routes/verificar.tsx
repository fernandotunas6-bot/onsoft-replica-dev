// style-check: route-exempt - página pública de verificação de documentos, sem shell administrativo.
import { useState, type FormEvent } from "react";
import { publicErrorMessage } from "@/lib/public-error";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SigaLogo } from "@/components/ui/siga-logo";
import { InlineLoading } from "@/components/ui/inline-loading";
import { MoreInfo } from "@/components/ui/more-info";
import { actionIcons, statusIcons } from "@/lib/app-icons";
import { verifyIssuedDocument } from "@/features/documents/verification";

export const Route = createFileRoute("/verificar")({
  validateSearch: z.object({ codigo: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Verificar documento · SIGA" },
      {
        name: "description",
        content: "Confirme a autenticidade de um documento emitido por uma escola no SIGA.",
      },
    ],
  }),
  component: VerifyDocumentPage,
});

function VerifyDocumentPage() {
  const { codigo } = Route.useSearch();
  const navigate = useNavigate({ from: "/verificar" });
  const [draft, setDraft] = useState(codigo ?? "");
  const code = codigo?.trim() ?? "";

  const query = useQuery({
    queryKey: ["verify-document", code],
    enabled: code.length >= 4,
    retry: false,
    queryFn: () => verifyIssuedDocument({ data: { code } }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void navigate({ search: { codigo: draft.trim() || undefined } });
  };

  const ValidIcon = statusIcons.success;
  const InvalidIcon = statusIcons.error;
  const SearchIcon = actionIcons.search;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <SigaLogo />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Verificar documento</h1>
          <p className="text-sm text-muted-foreground">Código impresso no documento ou QR Code.</p>
        </div>

        <form onSubmit={submit} className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="verify-code">Código de verificação</Label>
            <Input
              id="verify-code"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="SIGA-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button type="submit" className="gap-2">
            <SearchIcon className="size-4" /> Verificar
          </Button>
        </form>

        {query.isLoading ? (
          <InlineLoading label="A verificar…" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            {/* Erros técnicos não chegam ao público (publicErrorMessage). */}
            {publicErrorMessage(query.error, "Não foi possível verificar agora. Tente mais tarde.")}
          </p>
        ) : query.data?.valid ? (
          <section className="space-y-2 rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 font-medium text-success">
              <ValidIcon className="size-5" /> Documento válido
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Documento</dt>
              <dd>{query.data.title}</dd>
              <dt className="text-muted-foreground">Emitido por</dt>
              <dd>
                {query.data.schoolName}
                {query.data.issuerRole ? (
                  <span className="text-muted-foreground"> · {query.data.issuerRole}</span>
                ) : null}
              </dd>
              {query.data.reference ? (
                <>
                  <dt className="text-muted-foreground">Número</dt>
                  <dd>{query.data.reference}</dd>
                </>
              ) : null}
              {query.data.amount ? (
                <>
                  <dt className="text-muted-foreground">Valor</dt>
                  <dd>{query.data.amount}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Titular</dt>
              <dd>{query.data.holder}</dd>
              <dt className="text-muted-foreground">Data</dt>
              <dd>{new Date(query.data.issuedAt).toLocaleString("pt-AO")}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">Compare com o documento.</p>
          </section>
        ) : query.data && !query.data.valid ? (
          <section className="space-y-1 rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <InvalidIcon className="size-5" /> Código não encontrado
            </p>
            <p className="text-sm text-muted-foreground">Confirme se escreveu bem o código.</p>
            <MoreInfo>
              Nenhum documento foi emitido no SIGA com este código. Se o código está certo, o
              documento não é autêntico.
            </MoreInfo>
          </section>
        ) : null}
      </div>
    </main>
  );
}
