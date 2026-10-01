import * as React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { ModalHeader } from "./ModalHeader";
import { ModalContent } from "./ModalContent";
import { ModalFooter } from "./ModalFooter";

export interface ImpactItem {
  label: string;
  count: number;
}

export interface DeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  itemName: string;
  itemType?: string;
  impacts?: ImpactItem[];
  warningMessage?: string;
  onConfirm: () => void | Promise<void>;
  isDeleting?: boolean;
  cannotDeleteReason?: string;
}

export function DeleteConfirmModal({
  open,
  onOpenChange,
  title,
  itemName,
  itemType = "registo",
  impacts = [],
  warningMessage,
  onConfirm,
  isDeleting = false,
  cannotDeleteReason,
}: DeleteConfirmModalProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cannotDeleteReason) {
      await onConfirm();
    }
  };

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="sm">
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 max-h-[inherit] flex-col overflow-hidden"
      >
        <ModalHeader
          icon={Trash2}
          title={title}
          subtitle={`Eliminar ${itemType}`}
          onClose={() => onOpenChange(false)}
        />
        <ModalContent className="space-y-3">
          <p className="text-xs text-foreground">
            Tem a certeza que deseja eliminar <strong>{itemName}</strong>?
          </p>

          {warningMessage && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">{warningMessage}</p>
            </div>
          )}

          {impacts.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
              <p className="font-medium text-foreground">Impacto associado a esta operação:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                {impacts.map((item, idx) => (
                  <li key={idx}>
                    <strong>{item.count}</strong> {item.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cannotDeleteReason && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-600 text-xs font-medium">
              ⚠️ {cannotDeleteReason}
            </div>
          )}
        </ModalContent>
        <ModalFooter
          onCancel={() => onOpenChange(false)}
          submitLabel="Eliminar definitivamente"
          submitVariant="destructive"
          isSubmitting={isDeleting}
          disabled={Boolean(cannotDeleteReason)}
        />
      </form>
    </ModalShell>
  );
}
