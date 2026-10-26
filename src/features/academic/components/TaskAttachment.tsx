import { useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip } from "lucide-react";
import { toast } from "@/lib/toast";
import { publicErrorMessage } from "@/lib/public-error";
import { cn } from "@/lib/utils";
import { formatBytes, type AttachmentInfo } from "@/features/academic/task-attachments";
import { openTaskSubmissionFile } from "@/features/academic/task-submissions-server";

/** O anexo de uma entrega: abre num separador novo, por URL assinado de 10 minutos. */
export function AttachmentLink({
  taskId,
  submissionId,
  file,
  className,
}: {
  taskId: string;
  submissionId: string;
  file: AttachmentInfo;
  className?: string;
}) {
  const [opening, setOpening] = useState(false);
  const Icon = file.mime.startsWith("image/") ? ImageIcon : FileText;
  const open = async () => {
    // O separador abre já, no clique: aberto depois do pedido, o navegador bloqueava-o.
    const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setOpening(true);
    try {
      const { url } = await openTaskSubmissionFile({ data: { taskId, submissionId } });
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      tab?.close();
      toast.error(publicErrorMessage(error, "Não foi possível abrir o anexo."));
    } finally {
      setOpening(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={opening}
      aria-label={`Abrir anexo ${file.name}`}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/60 disabled:opacity-60",
        className,
      )}
    >
      {opening ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
      )}
      <span className="min-w-0 truncate font-medium">{file.name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatBytes(file.sizeBytes)}
      </span>
      <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
