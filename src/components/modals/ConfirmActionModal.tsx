import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { QuickModal } from "@/components/ui/modal-system";

/** Confirmação destructiva (excluir/anular) com feedback toast. */
export function ConfirmActionModal({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  eyebrow = "Confirmação",
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  eyebrow?: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const run = async () => {
    setSaving(true);
    try {
      await onConfirm();
      setOpen(false);
      toast.success(title, { description: "Operação concluída." });
    } catch (error) {
      toast.error("Não foi possível concluir", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <QuickModal
        open={open}
        onOpenChange={setOpen}
        title={title}
        subtitle={description ?? eyebrow}
        submitLabel={confirmLabel}
        submitVariant="destructive"
        isSubmitting={saving}
        onSubmit={run}
        size="sm"
      >
        <p className="text-sm text-muted-foreground">
          Esta acção fica registada no histórico da escola e pode afectar listas e pautas.
        </p>
      </QuickModal>
    </>
  );
}
