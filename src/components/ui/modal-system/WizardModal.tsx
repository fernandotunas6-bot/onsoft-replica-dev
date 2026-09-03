import * as React from "react";
import { Check, type LucideIcon } from "lucide-react";
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
    if (!isLastStep && canProceed) {
      onStepChange(currentStepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      onStepChange(currentStepIndex - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLastStep) {
      await onSubmit();
    } else {
      handleNext();
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
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <form
        onSubmit={handleSubmit}
        className={
          visualPanel
            ? "grid min-h-[78vh] max-h-[90vh] overflow-hidden lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)]"
            : "flex flex-col"
        }
      >
        {visualPanel ? (
          <aside className="hidden min-h-0 overflow-hidden border-r border-border bg-muted/20 lg:block">
            {visualPanel}
          </aside>
        ) : null}
        <div className={visualPanel ? "flex min-h-0 flex-col" : "contents"}>
        <ModalHeader
          {...(icon ? { icon } : {})}
          title={title}
          subtitle={subtitle}
          onClose={guardedClose}
        />

        {/* Stepper Progress Bar */}
        <div className="border-b border-border bg-muted/10 px-6 py-2.5">
          <div className="flex items-center justify-between gap-2 overflow-x-auto">
            {steps.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <React.Fragment key={step.id}>
                  <div
                    onClick={() => isCompleted && onStepChange(idx)}
                    className={`flex items-center gap-2 ${
                      isCompleted ? "cursor-pointer hover:opacity-80" : ""
                    }`}
                  >
                    <div
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isCompleted
                          ? "bg-emerald-600 text-white"
                          : isCurrent
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <Check className="size-3.5" /> : idx + 1}
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        isCurrent
                          ? "text-foreground font-semibold"
                          : isCompleted
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-0.5 min-w-4 flex-1 ${
                        idx < currentStepIndex ? "bg-emerald-600" : "bg-border"
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
          isSubmitting={isSubmitting}
          extraActions={
            !isFirstStep ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrev}
                className="text-xs"
              >
                Anterior
              </Button>
            ) : null
          }
        />
        </div>
      </form>
    </ModalShell>
  );
}
