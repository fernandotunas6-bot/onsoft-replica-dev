import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ModalFooterProps {
  onCancel?: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  cancelLabel?: string;
  submitLabel?: React.ReactNode;
  isSubmitting?: boolean;
  submitVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  disabled?: boolean;
  extraActions?: React.ReactNode;
  className?: string;
}

export function ModalFooter({
  onCancel,
  onSubmit,
  cancelLabel = "Cancelar",
  submitLabel = "Guardar",
  isSubmitting = false,
  submitVariant = "default",
  disabled = false,
  extraActions,
  className,
}: ModalFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-border bg-muted/10 px-5 py-3 gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">{extraActions}</div>

      <div className="flex items-center gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs"
          >
            {cancelLabel}
          </Button>
        )}

        {onSubmit && (
          <Button
            type="submit"
            variant={submitVariant}
            size="sm"
            onClick={onSubmit}
            disabled={disabled || isSubmitting}
            className="gap-1.5 text-xs min-w-[90px]"
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
