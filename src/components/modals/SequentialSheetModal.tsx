import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { WizardModal } from "@/components/ui/modal-system";
import { cn } from "@/lib/utils";

export type SheetStep = {
  id: string;
  label: string;
  description?: string;
};

export function SequentialSheetModal({
  open,
  onOpenChange,
  eyebrow,
  title,
  description,
  steps,
  submitLabel = "Guardar",
  successDescription = "Registo guardado com sucesso.",
  onSubmit,
  hasUnsavedChanges = false,
  visualPanel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  steps: SheetStep[];
  submitLabel?: string;
  successDescription?: string;
  onSubmit: () => Promise<void>;
  hasUnsavedChanges?: boolean;
  visualPanel?: (ctx: { stepId: string; stepIndex: number }) => ReactNode;
  children: (ctx: { stepId: string; stepIndex: number }) => ReactNode;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  // Guarda síncrona contra dois cliques no mesmo instante (ver QuickFormModal).
  const inFlight = useRef(false);
  const current = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const handleFinish = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await onSubmit();
      onOpenChange(false);
      toast.success(`${title} concluído`, { description: successDescription });
    } catch (error) {
      toast.error("Não foi possível guardar", {
        description: error instanceof Error ? error.message : "Tenta novamente.",
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <WizardModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={description ?? eyebrow}
      steps={steps}
      currentStepIndex={stepIndex}
      onStepChange={setStepIndex}
      onSubmit={handleFinish}
      isSubmitting={saving}
      hasUnsavedChanges={hasUnsavedChanges}
      submitLabel={submitLabel}
      visualPanel={
        current && visualPanel ? visualPanel({ stepId: current.id, stepIndex }) : undefined
      }
      size={visualPanel ? "2xl" : "xl"}
    >
      <div className="min-w-0 space-y-4">
        {current?.description && (
          <p className="break-words text-[13px] leading-[20px] text-muted-foreground">
            {current.description}
          </p>
        )}
        <div className="min-w-0 rounded-2xl border border-border bg-card p-1">
          {current ? children({ stepId: current.id, stepIndex }) : null}
        </div>
      </div>
    </WizardModal>
  );
}

export function SheetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-2">
      {children}
    </div>
  );
}

export function SheetCell({
  label,
  children,
  full,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn("block min-w-0 bg-card px-4 py-4", full && "sm:col-span-2")}>
      <span className="mb-2 block break-words text-[12px] font-medium leading-[20px] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
