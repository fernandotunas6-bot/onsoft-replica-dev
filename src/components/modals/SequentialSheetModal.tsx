import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
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
  const current = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const handleFinish = async () => {
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
      <div className="space-y-3">
        {current?.description && (
          <p className="text-xs text-muted-foreground">{current.description}</p>
        )}
        <div className="rounded-xl border border-border bg-secondary/20 p-1">
          {current ? children({ stepId: current.id, stepIndex }) : null}
        </div>
      </div>
    </WizardModal>
  );
}

export function SheetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2">
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
    <label className={cn("block bg-card px-4 py-3", full && "sm:col-span-2")}>
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
