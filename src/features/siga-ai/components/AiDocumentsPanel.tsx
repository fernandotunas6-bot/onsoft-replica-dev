import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import type { AiStatus } from "../gateway.server";
import { MAX_DOCUMENT_CHARS, type AiDocumentScope } from "../schemas";
import { DocxParseError, extractDocxText } from "../docx-text";
import { PdfParseError, extractPdfText } from "../pdf-text";
import { aiDeleteDocument, aiIngestDocument, aiListDocuments } from "../server";

const SCOPE_LABEL: Record<AiDocumentScope, string> = {
  personal: "Pessoal",
  school: "Escola",
  public: "Público",
};

/** Formatos cujo texto o browser extrai sem serviço externo. */
const ACCEPTED =
  ".txt,.md,.markdown,.csv,.docx,.pdf,text/plain,text/markdown,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Texto do ficheiro escolhido. O .docx é descomprimido e lido aqui, no browser:
 * o servidor recebe texto, nunca o binário, e por isso nenhuma biblioteca de
 * análise de ficheiros corre do lado do servidor com a chave de serviço.
 */
async function readFileText(file: File): Promise<string> {
  const isDocx = file.type === DOCX_MIME || /\.docx$/i.test(file.name);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isDocx && !isPdf) return file.text();
  try {
    const buffer = await file.arrayBuffer();
    return isDocx ? await extractDocxText(buffer) : await extractPdfText(buffer);
  } catch (error) {
    // Os erros destes dois extractores já dizem o que fazer; qualquer outro é
    // falha nossa e não deve aparecer como «documento inválido».
    if (error instanceof DocxParseError || error instanceof PdfParseError) throw error;
    throw new Error(
      `Não foi possível ler este ${isDocx ? ".docx" : "PDF"}. Guarde-o de novo, ` +
        "ou cole o texto num .txt.",
    );
  }
}

export function AiDocumentsPanel({ status }: { status: AiStatus }) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<AiDocumentScope>("school");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const documents = useQuery({
    queryKey: ["siga-ai", "documents"],
    queryFn: () => aiListDocuments({ data: { limit: 100 } }),
  });

  const ingest = useMutation({
    mutationFn: async (file: File) => {
      const text = await readFileText(file);
      if (text.length > MAX_DOCUMENT_CHARS) {
        throw new Error("Documento demasiado grande. Divida-o em partes.");
      }
      return aiIngestDocument({
        data: {
          title: file.name.replace(/\.[a-z0-9]+$/i, ""),
          text,
          scope,
          sourceName: file.name,
          mimeType: file.type || "text/plain",
        },
      });
    },
    onSuccess: (document) => {
      toast.success(`"${document.title}" indexado em ${document.chunkCount} fragmento(s).`);
      void queryClient.invalidateQueries({ queryKey: ["siga-ai", "documents"] });
    },
    onError: (error: Error) =>
      toast.error(error.message || "Não foi possível indexar o documento."),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) => aiDeleteDocument({ data: { documentId } }),
    onSuccess: () => {
      toast.success("Documento removido da base.");
      void queryClient.invalidateQueries({ queryKey: ["siga-ai", "documents"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível remover."),
  });

  const ready = status.knowledgeBase === "ready";

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="siga-ai-scope">
            Âmbito
          </label>
          <Select value={scope} onValueChange={(value) => setScope(value as AiDocumentScope)}>
            <SelectTrigger id="siga-ai-scope" className="h-9 w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Pessoal (só eu)</SelectItem>
              <SelectItem value="school">Escola</SelectItem>
              <SelectItem value="public">Público da escola</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          className="h-9 w-auto"
          aria-label="Ficheiro a indexar"
          disabled={!ready || ingest.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) ingest.mutate(file);
            event.target.value = "";
          }}
        />
        <Button
          variant="outline"
          className="gap-2"
          disabled={!ready || ingest.isPending}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-4" aria-hidden="true" />
          {ingest.isPending ? "A indexar…" : "Indexar documento"}
        </Button>
      </div>

      {!ready ? (
        <p className="text-sm text-muted-foreground">
          A base documental não está disponível: é preciso o Qdrant configurado e o modelo de
          embeddings <span className="font-mono">{status.embeddingModel}</span> instalado.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Formatos aceites: TXT, Markdown, CSV e Word (.docx) — o texto do .docx é extraído neste
          browser. PDF ainda não: precisa de uma biblioteca de análise que não está instalada.
        </p>
      )}

      {!documents.data?.length ? (
        <EmptyState
          title="Sem documentos indexados"
          description="Indexe regulamentos, manuais e materiais pedagógicos para a IA os poder citar."
        />
      ) : (
        <ul className="divide-y">
          {documents.data.map((document) => (
            <li key={document.id} className="flex items-center gap-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{document.title}</p>
                <p className="text-xs text-muted-foreground">
                  {document.chunkCount} fragmento(s)
                  {document.sourceName ? ` · ${document.sourceName}` : ""}
                </p>
              </div>
              <Badge variant="outline">{SCOPE_LABEL[document.scope]}</Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Remover ${document.title}`}
                onClick={() => remove.mutate(document.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
