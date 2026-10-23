import * as React from "react";
import { Check, type LucideIcon } from "lucide-react";
import { useSubmitLock } from "./use-submit-lock";
import { ModalShell } from "./ModalShell";
import { ModalHeader } from "./ModalHeader";
import { ModalContent } from "./ModalContent";
import { ModalFooter } from "./ModalFooter";
import { confirmDiscardChanges } from "./confirm-close";
import { Button } from "@/components/ui/button";

export interface StepItem {
  id: string | number;
  label: string;
  description?: string;
}

export interface WizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  steps: StepItem[];
  currentStepIndex: number;
  onStepChange: (stepIndex: number) => void;
  children: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  isSubmitting?: boolean;
  hasUnsavedChanges?: boolean;
  size?: "md" | "lg" | "xl" | "2xl";
  canProceed?: boolean;
  submitLabel?: React.ReactNode;
  visualPanel?: React.ReactNode;
}

export function WizardModal({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  steps,
  currentStepIndex,
  onStepChange,
  children,
  onSubmit,
  isSubmitting = false,
  hasUnsavedChanges = false,
  size = "xl",
  canProceed = true,
  submitLabel = "Concluir",
  visualPanel,
}: WizardModalProps) {
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const handleNext = () => {
    if (!isLastStep && canProceed && !isSubmitting) {
      onStepChange(currentStepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep && !isSubmitting && !submission.pending) {
      onStepChange(currentStepIndex - 1);
    }
  };

  const submission = useSubmitLock();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProceed || isSubmitting) return;
    if (isLastStep) {
      await submission.run(onSubmit);
    } else {
      handleNext();
    }
  };

  const guardedClose = () => {
    if (isSubmitting || submission.pending) return;
    if (confirmDiscardChanges(hasUnsavedChanges)) onOpenChange(false);
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (!isSubmitting && !submission.pending) onOpenChange(false);
      }}
      size={size}
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <form
        onSubmit={handleSubmit}
        className={
          visualPanel
            ? "grid min-h-0 min-w-0 max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden lg:min-h-[78dvh] lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)]"
            : "flex min-h-0 min-w-0 flex-1 flex-col"
        }
      >
        {visualPanel ? (
          <aside className="hidden min-h-0 overflow-hidden border-r border-border bg-muted/20 lg:row-span-4 lg:block">
            {visualPanel}
          </aside>
        ) : null}
        <ModalHeader
          {...(icon ? { icon } : {})}
          title={title}
          subtitle={subtitle}
          onClose={guardedClose}
        />

        {/* Stepper Progress Bar */}
        <div className="shrink-0 border-b border-border bg-card px-5 py-3">
          <div className="flex min-w-0 items-center justify-between gap-2 overflow-x-auto">
            {steps.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    disabled={!isCompleted || isSubmitting || submission.pending}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`Etapa ${idx + 1}: ${step.label}`}
                    onClick={() =>
                      isCompleted && !isSubmitting && !submission.pending && onStepChange(idx)
                    }
                    className="flex min-h-[44px] max-w-[260px] shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] leading-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring enabled:hover:bg-muted"
                  >
                    <span
                      aria-hidden
                      className={`flex size-[28px] shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${
                        isCompleted
                          ? "bg-primary-soft text-primary-strong"
                          : isCurrent
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <Check className="size-[16px]" aria-hidden /> : idx + 1}
                    </span>
                    <span
                      className={`max-w-[200px] whitespace-normal break-words font-medium ${
                        isCurrent
                          ? "text-foreground font-semibold"
                          : isCompleted
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
                  {idx < steps.length - 1 && (
                    <div
                      aria-hidden
                      className={`h-[2px] min-w-[16px] flex-1 ${
                        idx < currentStepIndex ? "bg-primary/40" : "bg-border"
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <ModalContent>{children}</ModalContent>

        <ModalFooter
          onCancel={guardedClose}
          cancelLabel="Cancelar"
          onSubmit={handleSubmit}
          submitLabel={isLastStep ? submitLabel : "Avançar"}
          disabled={!canProceed}
          isSubmitting={isSubmitting || submission.pending}
          extraActions={
            !isFirstStep ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={isSubmitting || submission.pending}
                className="h-auto min-h-[44px] max-w-full whitespace-normal rounded-xl px-4 py-3 text-[13px] leading-[20px] lg:min-h-[44px]"
              >
                Anterior
              </Button>
            ) : null
          }
        />
      </form>
    </ModalShell>
  );
}
