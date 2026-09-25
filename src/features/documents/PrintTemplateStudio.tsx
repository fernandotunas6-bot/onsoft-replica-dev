import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, FileStack, Pencil, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { cn } from "@/lib/utils";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import {
  getPrintTemplate,
  listPrintTemplates,
  resetPrintTemplate,
  savePrintTemplate,
  setActivePrintTemplate,
} from "@/features/documents/server";
import { renderHandlebars } from "@/features/documents/render-hbs";
import { buildPrintSamplePayload } from "@/features/documents/print-catalog";
import { printOfficialHtml } from "@/lib/print-html";

export function PrintTemplateStudio() {
  const queryClient = useQueryClient();
  const { school, selectedYearLabel } = useSchoolSettings();
  const resendDocuments = useInstalledIntegrations().hasCapability("resend.documents");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const catalogQuery = useQuery({
    queryKey: ["documents", "print-templates"],
    queryFn: () => listPrintTemplates(),
  });
  const templateQuery = useQuery({
    queryKey: ["documents", "print-template", openKey],
    queryFn: () => getPrintTemplate({ data: { key: openKey! } }),
    enabled: Boolean(openKey),
  });

  useEffect(() => {
    if (templateQuery.data?.source) setDraft(templateQuery.data.source);
  }, [templateQuery.data?.source, openKey]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalogQuery.data?.items ?? []).filter(
      (item) =>
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q),
    );
  }, [catalogQuery.data?.items, query]);

  const defaultIssue = useMemo(() => {
    const issueKey = catalogQuery.data?.issue;
    if (!issueKey) return null;
    return (
      items.find((item) => item.key === issueKey) ??
      catalogQuery.data?.items?.find((item) => item.key === issueKey) ??
      null
    );
  }, [catalogQuery.data?.issue, catalogQuery.data?.items, items]);

  const previewHtml = useMemo(() => {
    if (!templateQuery.data) return "";
    try {
      return renderHandlebars(
        draft || templateQuery.data.source,
        buildPrintSamplePayload(
          {
            name: school?.name ?? "Escola SIGA",
            nif: school?.nif,
            phone: school?.phone,
            email: school?.email,
            address: school?.address,
            directorName: school?.director_name,
            academicYear:
              selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
          },
          { css: templateQuery.data.css },
        ),
      );
    } catch (error) {
      return `<pre style="padding:24px;color:#b91c1c;font:14px/1.4 ui-monospace,monospace">${
        error instanceof Error ? error.message : "Erro ao renderizar o modelo."
      }</pre>`;
    }
  }, [draft, school, selectedYearLabel, templateQuery.data]);

  const refreshCatalog = () =>
    queryClient.invalidateQueries({ queryKey: ["documents", "print-templates"] });

  const applyTemplate = async (key: string) => {
    await setActivePrintTemplate({ data: { key } });
    await refreshCatalog();
    toast.success("Modelo escolhido para emissão.");
  };

  const saveDraft = async () => {
    if (!openKey) return;
    setSaving(true);
    try {
      await savePrintTemplate({ data: { key: openKey, source: draft } });
      await Promise.all([
        refreshCatalog(),
        queryClient.invalidateQueries({ queryKey: ["documents", "print-template", openKey] }),
      ]);
      toast.success("Modelo guardado para esta escola.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar o modelo.");
    } finally {
      setSaving(false);
    }
  };

  const restoreOriginal = async () => {
    if (!openKey) return;
    setSaving(true);
    try {
      await resetPrintTemplate({ data: { key: openKey } });
      await Promise.all([
        refreshCatalog(),
        queryClient.invalidateQueries({ queryKey: ["documents", "print-template", openKey] }),
      ]);
      if (templateQuery.data?.original) setDraft(templateQuery.data.original);
      toast.success("Modelo restaurado ao original.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível restaurar o modelo.");
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = Boolean(templateQuery.data) && draft !== templateQuery.data?.source;

  return (
    <div id="modelos" className="scroll-mt-24">
      {resendDocuments ? (
        <p className="mb-4 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          Com Resend instalado, use <strong>E-mail Resend</strong> nos pedidos emitidos ou copie a
          amostra abaixo para enviar declarações ao encarregado.
        </p>
      ) : null}
      <p className="mb-4 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {defaultIssue ? (
          <>
            Modelo por defeito na emissão: <strong>{defaultIssue.title}</strong> (
            <code className="font-mono">{defaultIssue.key}</code>). O botão <strong>Usar</strong>{" "}
            define também o tipo <code className="font-mono">{defaultIssue.type}</code>.
          </>
        ) : (
          <>
            Nenhum modelo global escolhido — a emissão tenta reconhecer o tipo do documento e cai na{" "}
            <strong>Declaração de notas</strong> se não houver correspondência.
          </>
        )}
      </p>
      <Panel
        title="Modelos de impressão"
        description="Pré-visualize, edite e escolha o modelo usado na emissão."
        action={
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar modelos…"
            aria-label="Filtrar modelos de impressão"
            className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
          />
        }
      >
        {catalogQuery.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            Não foi possível carregar os modelos de {`public/templates`}.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <div key={item.key} className="flex flex-col rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  {item.active ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Em uso
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {item.customized ? "Personalizado" : "Original"}
                  {item.sourceOfTruth ? " · fonte oficial" : ""}
                  {item.type ? ` · ${item.type}` : ""}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOpenKey(item.key)}>
                    <Eye className="size-3.5" /> Ver
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpenKey(item.key)}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant={item.active ? "secondary" : "default"}
                    onClick={() => void applyTemplate(item.key)}
                  >
                    <Check className="size-3.5" /> Usar
                  </Button>
                </div>
              </div>
            ))}
            {items.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                Nenhum modelo corresponde ao filtro.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <ModalShell
        open={Boolean(openKey)}
        onOpenChange={(open) => {
          if (!open && confirmDiscardChanges(hasUnsavedChanges)) setOpenKey(null);
        }}
        size="full"
        hasUnsavedChanges={hasUnsavedChanges}
      >
        <div className="flex flex-col h-full">
          <ModalHeader
            icon={FileStack}
            title={templateQuery.data?.title ?? "Modelo de impressão"}
            subtitle="Altere o HTML do modelo. A pré-visualização usa dados de exemplo da escola."
            onClose={() => {
              if (confirmDiscardChanges(hasUnsavedChanges)) setOpenKey(null);
            }}
          />
          <ModalContent>
            <div className="grid min-h-[68vh] gap-4 lg:grid-cols-2">
              <label className="flex min-h-[320px] flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Fonte do modelo</span>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  spellCheck={false}
                  className={cn(
                    "min-h-[320px] flex-1 resize-none rounded-lg border border-input bg-muted/30 p-3",
                    "font-mono text-[12px] leading-5",
                  )}
                />
              </label>
              <div className="flex min-h-[320px] flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Pré-visualização
                </span>
                <iframe
                  title="Pré-visualização do modelo"
                  className="siga-print-preview min-h-[320px] flex-1 rounded-lg border border-border"
                  srcDoc={previewHtml}
                />
              </div>
            </div>
          </ModalContent>
          <ModalFooter
            onCancel={() => {
              if (confirmDiscardChanges(hasUnsavedChanges)) setOpenKey(null);
            }}
            onSubmit={async () => {
              if (openKey) await saveDraft();
            }}
            isSubmitting={saving}
            submitLabel="Guardar alterações"
            extraActions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving || !templateQuery.data}
                  onClick={() => void restoreOriginal()}
                >
                  <RotateCcw className="size-3.5" /> Restaurar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!previewHtml}
                  onClick={() => {
                    try {
                      printOfficialHtml(previewHtml);
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Não foi possível imprimir.",
                      );
                    }
                  }}
                >
                  <Printer className="size-3.5" /> Imprimir amostra
                </Button>
              </>
            }
          />
        </div>
      </ModalShell>
    </div>
  );
}
