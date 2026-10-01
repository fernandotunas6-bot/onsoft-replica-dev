import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { ModalHeader } from "./ModalHeader";
import { ModalContent } from "./ModalContent";
import { ModalFooter } from "./ModalFooter";
import { confirmDiscardChanges } from "./confirm-close";

export interface SubModalProps {
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
  hasUnsavedChanges?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}

/**
 * SubModal — desenhado especificamente para operações secundárias/contextuais
 * lançadas por um modal pai (ex: "+ Criar Responsável" dentro de uma Matrícula).
 * Abre num nível z-index superior, garantindo que o estado do modal pai permanece 100% intacto.
 */
export function SubModal({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  children,
  submitLabel = "Concluir",
  cancelLabel = "Cancelar",
  onSubmit,
  isSubmitting = false,
  hasUnsavedChanges = false,
  size = "md",
}: SubModalProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit();
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
      className="z-70"
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 max-h-[inherit] flex-col overflow-hidden"
      >
        <ModalHeader
          {...(icon ? { icon } : {})}
          title={title}
          subtitle={subtitle}
          onClose={guardedClose}
        />
        <ModalContent>{children}</ModalContent>
        <ModalFooter
          onCancel={guardedClose}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
          cancelLabel={cancelLabel}
          isSubmitting={isSubmitting}
        />
      </form>
    </ModalShell>
  );
}
