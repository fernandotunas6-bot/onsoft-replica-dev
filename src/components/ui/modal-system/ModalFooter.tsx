import * as React from "react";
import { LoaderCircle } from "lucide-react";
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
        "flex shrink-0 flex-col items-stretch justify-between gap-2 border-t border-border bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5",
        className,
      )}
    >
      {extraActions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{extraActions}</div>
      ) : null}

      <div className="flex min-w-0 flex-col-reverse gap-2 sm:ml-auto sm:flex-row sm:items-center">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="min-w-0 whitespace-normal text-xs"
          >
            {cancelLabel}
          </Button>
        )}

        {onSubmit && (
          <Button
            type="submit"
            variant={submitVariant}
            size="sm"
            onClick={(event) => {
              // Dentro de um formulário, a submissão nativa valida os campos
              // obrigatórios antes de chamar onSubmit. QuickForm mantém o
              // rodapé fora do formulário e trata a sua própria validação.
              if (!event.currentTarget.form) onSubmit(event);
            }}
            disabled={disabled || isSubmitting}
            className="min-w-0 gap-1.5 whitespace-normal text-xs sm:min-w-[90px]"
            aria-busy={isSubmitting}
          >
            {isSubmitting && <LoaderCircle className="size-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
