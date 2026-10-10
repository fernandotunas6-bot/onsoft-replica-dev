import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, FileText, Check } from "lucide-react";
import { listOfficialTemplates, CommunicationTemplate } from "./templates";
import { toast } from "@/lib/toast";

export interface TemplatesCatalogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate?: (template: CommunicationTemplate) => void;
}

export function TemplatesCatalogModal({
  open,
  onOpenChange,
  onSelectTemplate,
}: TemplatesCatalogModalProps) {
  const templates = listOfficialTemplates();
  const [selectedSlug, setSelectedSlug] = React.useState<string>(templates[0]?.slug || "");
  const [copied, setCopied] = React.useState(false);

  const activeTemplate = templates.find((t) => t.slug === selectedSlug) || templates[0];

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Conteúdo do template copiado para a área de transferência.");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FileText className="size-5 text-primary" />
            Catálogo de Templates Oficiais do SIGA Plus
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Modelos institucionais pré-formatados com variáveis automáticas para e-mail, WhatsApp e
            avisos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.6fr] gap-6 overflow-hidden pt-2 flex-1">
          {/* Lista de Templates */}
          <div className="space-y-1.5 overflow-y-auto pr-2">
            {templates.map((t) => (
              <button
                key={t.slug}
                onClick={() => setSelectedSlug(t.slug)}
                className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex flex-col gap-1 ${
                  selectedSlug === t.slug
                    ? "border-primary bg-primary/5 font-semibold text-foreground shadow-sm"
                    : "border-border hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground">{t.name}</span>
                  <Badge variant="outline" className="text-[11px] uppercase font-mono">
                    {t.category}
                  </Badge>
                </div>
                <span className="text-[11px] opacity-80 line-clamp-1">{t.description}</span>
              </button>
            ))}
          </div>

          {/* Pré-visualização do Template Selecionado */}
          {activeTemplate && (
            <div className="flex flex-col h-full overflow-y-auto rounded-lg border border-border bg-muted/20 p-4 space-y-4 text-xs">
              <div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  Assunto Predefinido:
                </span>
                <p className="font-semibold text-foreground mt-0.5">{activeTemplate.subject}</p>
              </div>

              <div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  Variáveis Disponíveis:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {activeTemplate.variables.map((v) => (
                    <code
                      key={v}
                      className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[11px] text-primary"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Mensagem (Texto Padrão):
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(activeTemplate.defaultText)}
                    className="h-6 px-2 text-[11px] gap-1"
                  >
                    {copied ? (
                      <Check className="size-3 text-primary" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    Copiar
                  </Button>
                </div>
                <pre className="p-3 bg-background border border-border rounded-md font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-foreground flex-1 overflow-y-auto">
                  {activeTemplate.defaultText}
                </pre>
              </div>

              {onSelectTemplate && (
                <div className="pt-2 border-t border-border flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      onSelectTemplate(activeTemplate);
                      onOpenChange(false);
                    }}
                    className="w-full sm:w-auto"
                  >
                    Usar este Template no Comunicado
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
