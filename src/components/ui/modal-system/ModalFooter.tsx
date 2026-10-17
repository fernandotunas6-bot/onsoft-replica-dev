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
        "flex shrink-0 flex-wrap items-center justify-between border-t border-border bg-card px-5 py-4 gap-3",
        className,
      )}
    >
      {extraActions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{extraActions}</div>
      ) : null}

      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-auto min-h-[44px] max-w-full whitespace-normal break-words rounded-xl px-4 py-3 text-[13px] leading-[20px] lg:min-h-[44px]"
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
            className="h-auto min-h-[44px] min-w-[90px] max-w-full gap-2 whitespace-normal break-words rounded-xl px-4 py-3 text-[13px] leading-[20px] lg:min-h-[44px]"
          >
            {isSubmitting && (
              <LoaderCircle className="size-[16px] shrink-0 animate-spin motion-reduce:animate-none" />
            )}
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
