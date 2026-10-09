import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { ModalHeader } from "./ModalHeader";
import { ModalContent } from "./ModalContent";
import { ModalFooter } from "./ModalFooter";
import { confirmDiscardChanges } from "./confirm-close";

export interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  children: React.ReactNode;
  submitLabel?: React.ReactNode;
  cancelLabel?: string;
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  isSubmitting?: boolean;
  disabled?: boolean;
  hasUnsavedChanges?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  extraActions?: React.ReactNode;
  className?: string;
}

export function FormModal({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  badge,
  children,
  submitLabel = "Guardar",
  cancelLabel = "Cancelar",
  onSubmit,
  isSubmitting = false,
  disabled = false,
  hasUnsavedChanges = false,
  size = "lg",
  extraActions,
}: FormModalProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit(e);
    }
  };

  const guardedClose = () => {
    if (confirmDiscardChanges(hasUnsavedChanges)) onOpenChange(false);
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size={size}
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ModalHeader
          {...(icon ? { icon } : {})}
          title={title}
          subtitle={subtitle}
          badge={badge}
          onClose={guardedClose}
        />
        <ModalContent>{children}</ModalContent>
        <ModalFooter
          onCancel={guardedClose}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
          cancelLabel={cancelLabel}
          isSubmitting={isSubmitting}
          disabled={disabled}
          extraActions={extraActions}
        />
      </form>
    </ModalShell>
  );
}
