import { useEffect, useState, type ReactNode } from "react";
import { DeleteConfirmModal } from "@/components/ui/modal-system";
import type { DeletionImpact } from "@/features/school/deletion-impact";

/**
 * Confirmação de eliminar/desactivar que mostra o impacto real, contado no
 * servidor ao abrir (`deletion-impact.ts`). Se o cálculo falhar, não se deixa
 * confirmar: um erro de rede nunca passa por «sem impacto».
 */
export function ImpactConfirmModal({
  trigger,
  title,
  itemName,
  itemType,
  verb,
  confirmLabel,
  loadImpact,
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  itemName: string;
  itemType: string;
  verb: string;
  confirmLabel: string;
  loadImpact: () => Promise<DeletionImpact>;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setImpact(null);
    setLoadError(null);
    loadImpact().then(
      (result) => {
        if (!cancelled) setImpact(result);
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error && error.message
            ? error.message
            : "Não foi possível calcular o impacto. Feche e tente de novo.",
        );
      },
    );
    return () => {
      cancelled = true;
    };
    // loadImpact muda a cada render de quem chama; só recalcular ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {trigger(() => setOpen(true))}
      <DeleteConfirmModal
        open={open}
        onOpenChange={setOpen}
        title={title}
        itemName={itemName}
        itemType={itemType}
        verb={verb}
        confirmLabel={confirmLabel}
        loadingImpacts={!impact && !loadError}
        impacts={impact?.impacts ?? []}
        warningMessage={impact?.warning ?? undefined}
        cannotDeleteReason={loadError ?? impact?.blocker ?? undefined}
        onConfirm={async () => {
          await onConfirm();
          setOpen(false);
        }}
      />
    </>
  );
}
