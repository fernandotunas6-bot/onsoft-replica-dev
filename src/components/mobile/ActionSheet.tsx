import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { BottomSheet, BottomSheetBody, BottomSheetHeader } from "./BottomSheet";

/**
 * Folha de acções (§107). Substitui a fila de 6 botões que o desktop mostra
 * numa linha de tabela: no telemóvel a acção principal fica no cartão e o resto
 * vem por aqui.
 *
 * As acções destrutivas ficam num grupo próprio no fim, separadas por uma
 * linha — nunca lado a lado com "Editar", onde um toque trocado apaga um aluno.
 */
export type SheetAction = {
  label: string;
  icon?: React.ElementType;
  onSelect: () => void;
  /** Linha secundária: diz o que a acção faz quando o verbo não basta. */
  hint?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Fora do alcance do utilizador: não se mostra (§53). */
  hidden?: boolean;
};

export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  actions: SheetAction[];
}) {
  const visible = actions.filter((action) => !action.hidden);
  const safe = visible.filter((action) => !action.destructive);
  const destructive = visible.filter((action) => action.destructive);

  const run = (action: SheetAction) => {
    onOpenChange(false);
    // O fecho da folha e a acção na mesma volta deixavam o diálogo de
    // confirmação a abrir enquanto a folha ainda animava a sair, e o foco
    // ficava preso na folha já desmontada.
    window.setTimeout(() => action.onSelect(), 120);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetHeader
        title={title}
        description={description}
        onClose={() => onOpenChange(false)}
      />
      <BottomSheetBody className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="space-y-1">
          {safe.map((action) => (
            <ActionRow key={action.label} action={action} onRun={run} />
          ))}
        </div>
        {destructive.length ? (
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            {destructive.map((action) => (
              <ActionRow key={action.label} action={action} onRun={run} />
            ))}
          </div>
        ) : null}
      </BottomSheetBody>
    </BottomSheet>
  );
}

function ActionRow({
  action,
  onRun,
}: {
  action: SheetAction;
  onRun: (action: SheetAction) => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={() => onRun(action)}
      className={cn(
        "touch-feedback flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
        "min-h-[var(--siga-control-md)] hover:bg-secondary disabled:pointer-events-none disabled:opacity-45",
        action.destructive ? "text-destructive-strong" : "text-foreground",
      )}
    >
      {Icon ? <Icon className="size-4.5 shrink-0 opacity-80" aria-hidden /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{action.label}</span>
        {action.hint ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{action.hint}</span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 opacity-30" aria-hidden />
    </button>
  );
}
