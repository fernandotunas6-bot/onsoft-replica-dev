import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { toast } from "@/lib/toast";
import { fileMotion } from "@/components/files/file-motion";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FileBrowser } from "./FileBrowser";
import { fileMatchesRequest, type SchoolFileRequest } from "./file-request";
import { resolveRequestedSchoolFile } from "./server";
import { DialogExpandButton, useExpandableDialog } from "./dialog-expand";
import type { FileArea, FileKind } from "./kinds";
import type { SchoolFileRecord } from "./schemas";

export function FilePickerModal({
  open,
  onOpenChange,
  area,
  acceptKinds,
  initialRelatedPersonId,
  request,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area?: FileArea | undefined;
  acceptKinds?: readonly FileKind[] | undefined;
  initialRelatedPersonId?: string;
  /** Contexto de destino: o servidor revalida antes de disponibilizar a referência. */
  request?: SchoolFileRequest;
  onPick?: ((file: SchoolFileRecord) => void) | undefined;
}) {
  const { expanded, toggleExpanded, contentClassName } = useExpandableDialog();
  const [validating, setValidating] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={contentClassName(
          `${fileMotion.panel} flex max-h-[min(92vh,800px)] w-[min(980px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl`,
        )}
      >
        <DialogExpandButton expanded={expanded} onToggle={toggleExpanded} />
        <div className="border-b border-border bg-card px-5 py-4 pr-20">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FolderOpen className="size-5 text-primary" />
            Escolher arquivo
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Escolha ou carregue um ficheiro.
            {validating ? " A verificar…" : ""}
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-secondary/20 p-3">
          <FileBrowser
            pickMode={Boolean(onPick)}
            initialArea={area}
            acceptKinds={acceptKinds}
            initialRelatedPersonId={initialRelatedPersonId}
            uploadClassGroupId={
              request?.purpose === "class-material"
                ? (request.classGroupId ?? undefined)
                : undefined
            }
            onPick={(file) => {
              if (file.isFolder || validating) return;
              if (request && !fileMatchesRequest(file, request)) {
                toast.error("Este ficheiro não é adequado à finalidade solicitada.");
                return;
              }
              if (!request || (request.purpose === "general" && file.storageBackend === "local")) {
                onPick?.(file);
                onOpenChange(false);
                return;
              }
              setValidating(true);
              void resolveRequestedSchoolFile({
                data: { id: file.id, ...request },
              })
                .then(() => {
                  onPick?.(file);
                  onOpenChange(false);
                })
                .catch((error: unknown) => {
                  toast.error("Não foi possível seleccionar o ficheiro.", {
                    description: error instanceof Error ? error.message : "Confirme as permissões.",
                  });
                })
                .finally(() => setValidating(false));
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
