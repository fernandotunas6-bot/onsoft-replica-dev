import * as React from "react";
import { FeedbackIcon } from "@/components/ui/feedback-icon";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Barra de guardar fixa ao fundo (§86). Em formulários longos, o botão
 * "Guardar" no fim da página obriga a rolar 40 campos para o encontrar.
 *
 * Fica acima da área segura e acima da barra de navegação: se ficasse por
 * baixo, o botão principal do ecrã era o único inacessível.
 */
export function SaveBar({
  onCancel,
  onSave,
  saving = false,
  dirty = true,
  saveLabel = "Guardar alterações",
  /** Estado do rascunho automático (§27), quando o ecrã o tem. */
  autosaveState,
  className,
}: {
  onCancel?: () => void;
  onSave: () => void;
  saving?: boolean;
  dirty?: boolean;
  saveLabel?: string;
  autosaveState?: "idle" | "saving" | "saved";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-[35] border-t border-border bg-card/95 backdrop-blur-sm",
        "px-4 pt-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {autosaveState && autosaveState !== "idle" ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          {autosaveState === "saving" ? (
            <>
              <FeedbackIcon state="processing" className="size-3" /> A guardar…
            </>
          ) : (
            <>
              <FeedbackIcon state="success" className="size-3 text-success-strong" /> Guardado
            </>
          )}
        </p>
      ) : null}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-11 flex-[1.4]"
          disabled={!dirty}
          loading={saving}
          onClick={onSave}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
