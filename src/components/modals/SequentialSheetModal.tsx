import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PremiumModal } from "@/components/ui/premium-modal";
import { Button } from "@/components/ui/button";
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
  icon,
  steps,
  submitLabel = "Guardar",
  successDescription = "Registo guardado com sucesso.",
  onSubmit,
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
  children: (ctx: { stepId: string; stepIndex: number }) => ReactNode;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const last = steps.length - 1;
  const current = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const progress = useMemo(
    () => (steps.length ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0),
    [stepIndex, steps.length],
  );

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit();
      onOpenChange(false);
      toast.success(`${title} concluído`, { description: successDescription });
    } catch (error) {
      toast.error("Não foi possível guardar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PremiumModal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={eyebrow}
      title={title}
      description={description}
      icon={icon}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            disabled={stepIndex === 0 || saving}
          >
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          {stepIndex < last ? (
            <Button onClick={() => setStepIndex((index) => Math.min(last, index + 1))}>
              Seguinte <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "A guardar…" : submitLabel}
            </Button>
          )}
        </>
      }
    >
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <span>
            Passo {stepIndex + 1} de {steps.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="mt-4 flex flex-wrap gap-2">
          {steps.map((step, index) => {
            const done = index < stepIndex;
            const active = index === stepIndex;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                    active && "border-primary bg-primary text-primary-foreground",
                    done && "border-primary/30 bg-primary/10 text-primary",
                    !active && !done && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : <span>{index + 1}</span>}
                  {step.label}
                </button>
              </li>
            );
          })}
        </ol>
        {current?.description ? (
          <p className="mt-3 text-sm text-muted-foreground">{current.description}</p>
        ) : null}
      </div>
      <div className="rounded-xl border border-border bg-secondary/20 p-1">
        {current ? children({ stepId: current.id, stepIndex }) : null}
      </div>
    </PremiumModal>
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
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
