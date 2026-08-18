import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PremiumModal } from "@/components/ui/premium-modal";
import { Button } from "@/components/ui/button";

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
      <PremiumModal
        open={open}
        onOpenChange={setOpen}
        eyebrow={eyebrow}
        title={title}
        description={description}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={run} disabled={saving}>
              {saving ? "A processar…" : confirmLabel}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Esta acção fica registada no histórico da escola e pode afectar listas e pautas.
        </p>
      </PremiumModal>
    </>
  );
}
