import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { useSubmitLock } from "./use-submit-lock";
import { ModalShell } from "./ModalShell";
import { ModalHeader } from "./ModalHeader";
import { ModalContent } from "./ModalContent";
import { ModalFooter } from "./ModalFooter";

export interface QuickModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  submitLabel?: React.ReactNode;
  cancelLabel?: string;
  onSubmit?: () => void | Promise<void>;
  isSubmitting?: boolean;
  submitVariant?: "default" | "destructive" | "outline" | "secondary";
  size?: "xs" | "sm" | "md";
  extraActions?: React.ReactNode;
}

export function QuickModal({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  children,
  submitLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onSubmit,
  isSubmitting = false,
  submitVariant = "default",
  size = "sm",
  extraActions,
}: QuickModalProps) {
  const submission = useSubmitLock();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (onSubmit) await submission.run(onSubmit);
  };

  const guardedClose = () => {
    if (!isSubmitting && !submission.pending) onOpenChange(false);
  };
  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : guardedClose())}
      size={size}
    >
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
        aria-busy={isSubmitting || submission.pending}
      >
        <ModalHeader
          {...(icon ? { icon } : {})}
          title={title}
          subtitle={subtitle}
          onClose={guardedClose}
          closeDisabled={isSubmitting || submission.pending}
        />
        <ModalContent>{children}</ModalContent>
        <ModalFooter
          onCancel={guardedClose}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
          cancelLabel={cancelLabel}
          isSubmitting={isSubmitting || submission.pending}
          submitVariant={submitVariant}
          extraActions={extraActions}
        />
      </form>
    </ModalShell>
  );
}
