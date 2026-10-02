import * as React from "react";
import { type LucideIcon } from "lucide-react";
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
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit();
    }
  };

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size={size}>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 max-h-[inherit] flex-col overflow-hidden"
      >
        <ModalHeader
          {...(icon ? { icon } : {})}
          title={title}
          subtitle={subtitle}
          onClose={() => onOpenChange(false)}
        />
        <ModalContent>{children}</ModalContent>
        <ModalFooter
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
          cancelLabel={cancelLabel}
          isSubmitting={isSubmitting}
          submitVariant={submitVariant}
          extraActions={extraActions}
        />
      </form>
    </ModalShell>
  );
}
