import { useMemo, useState } from "react";
import { FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { fileAreaMeta, type FileArea } from "./kinds";
import type { SchoolFileRecord } from "./schemas";
import { DialogExpandButton, useExpandableDialog } from "./dialog-expand";

export function MoveItemsDialog({
  open,
  count,
  area,
  folders,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  area: FileArea;
  folders: SchoolFileRecord[];
  onCancel: () => void;
  onConfirm: (parentId: string | null) => void;
}) {
  const { expanded, toggleExpanded, contentClassName } = useExpandableDialog();
  const [parentId, setParentId] = useState<string>("root");
  const options = useMemo(
    () => folders.filter((folder) => folder.isFolder && folder.area === area),
    [area, folders],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className={contentClassName(
          "max-h-[min(70vh,520px)] w-[min(440px,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden p-0 sm:rounded-2xl",
        )}
      >
        <DialogExpandButton expanded={expanded} onToggle={toggleExpanded} />
        <div className="border-b border-border px-5 py-4 pr-20">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FolderInput className="size-5 text-primary" />
            Mover {count} item{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Destino em {fileAreaMeta[area].label}. Escolha a raiz ou uma pasta.
          </DialogDescription>
        </div>
        <div className="space-y-3 px-5 py-4">
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            aria-label="Pasta de destino"
          >
            <option value="root">Raiz da área</option>
            {options.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.title || folder.name}
              </option>
            ))}
          </select>
          {!options.length ? (
            <p className="text-xs text-muted-foreground">
              Ainda não há pastas nesta área. Crie uma pasta primeiro.
            </p>
          ) : null}
        </div>
        <DialogFooter className="border-t border-border bg-secondary/30 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onConfirm(parentId === "root" ? null : parentId)}>
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
