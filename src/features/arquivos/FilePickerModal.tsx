import { FolderOpen } from "lucide-react";
import { fileMotion } from "@/components/files/file-motion";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FileBrowser } from "./FileBrowser";
import { DialogExpandButton, useExpandableDialog } from "./dialog-expand";
import type { FileArea, FileKind } from "./kinds";
import type { SchoolFileRecord } from "./schemas";

export function FilePickerModal({
  open,
  onOpenChange,
  area,
  acceptKinds,
  initialRelatedPersonId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area?: FileArea | undefined;
  acceptKinds?: readonly FileKind[] | undefined;
  initialRelatedPersonId?: string;
  onPick?: ((file: SchoolFileRecord) => void) | undefined;
}) {
  const { expanded, toggleExpanded, contentClassName } = useExpandableDialog();
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
            Lista com pastas, selecção e actividade. Duplo clique ou Enter para escolher; use
            Expandir para trabalhar em ecrã largo.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-secondary/20 p-3">
          <FileBrowser
            pickMode={Boolean(onPick)}
            initialArea={area}
            acceptKinds={acceptKinds}
            initialRelatedPersonId={initialRelatedPersonId}
            onPick={(file) => {
              if (file.isFolder) return;
              onPick?.(file);
              onOpenChange(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
