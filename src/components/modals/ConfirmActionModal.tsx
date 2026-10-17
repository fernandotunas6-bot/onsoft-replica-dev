import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { QuickModal } from "@/components/ui/modal-system";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MIN_REASON = 5;

/** Confirmação destructiva (excluir/anular) com feedback toast. */
export function ConfirmActionModal({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  eyebrow = "Confirmação",
  reasonLabel,
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  eyebrow?: string;
  /** Pede um motivo obrigatório (fica no histórico) e passa-o a `onConfirm`. */
  reasonLabel?: string;
  onConfirm: (reason?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");

  const run = async () => {
    if (reasonLabel && reason.trim().length < MIN_REASON) {
      toast.error(`Indique o motivo (pelo menos ${MIN_REASON} caracteres).`);
      return;
    }
    setSaving(true);
    try {
      await onConfirm(reasonLabel ? reason.trim() : undefined);
      setReason("");
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
        {reasonLabel ? (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="confirm-action-reason">{reasonLabel}</Label>
            <Textarea
              id="confirm-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              rows={3}
              required
            />
          </div>
        ) : null}
      </QuickModal>
    </>
  );
}
