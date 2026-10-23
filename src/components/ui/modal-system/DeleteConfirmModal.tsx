import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { ModalHeader } from "./ModalHeader";
import { ModalContent } from "./ModalContent";
import { ModalFooter } from "./ModalFooter";

export interface ImpactItem {
  label: string;
  count: number;
}

export interface DeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  itemName: string;
  itemType?: string;
  impacts?: ImpactItem[];
  warningMessage?: string;
  onConfirm: () => void | Promise<void>;
  isDeleting?: boolean;
  cannotDeleteReason?: string;
}

/** Confirmação breve. A eliminação só pode ser executada uma vez por submissão. */
export function DeleteConfirmModal({
  open,
  onOpenChange,
  title,
  itemName,
  itemType = "registo",
  impacts = [],
  warningMessage,
  onConfirm,
  isDeleting = false,
  cannotDeleteReason,
}: DeleteConfirmModalProps) {
  const submitting = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const busy = isDeleting || pending;

  const requestOpenChange = (next: boolean) => {
    if (!next && (submitting.current || busy)) return;
    if (next) setError(null);
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!open || busy || submitting.current || cannotDeleteReason) return;

    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      // Quem chamou continua responsável por actualizar/fechar depois do êxito.
      await onConfirm();
    } catch {
      // Não imprimir dados de erros de backend ou outras escolas neste modal.
      setError("Não foi possível eliminar. Tente novamente.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={requestOpenChange}
      preventOutsideClose
      size="xs"
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          Confirme a eliminação de {itemName}.
        </DialogPrimitive.Description>
        <ModalHeader title={title} onClose={() => requestOpenChange(false)} />
        <ModalContent className="space-y-3">
          <p className="break-words text-sm leading-relaxed text-foreground">
            Eliminar {itemType} <strong className="[overflow-wrap:anywhere]">{itemName}</strong>?
          </p>

          {warningMessage ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-foreground">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-sm leading-relaxed">{warningMessage}</p>
            </div>
          ) : null}

          {impacts.length > 0 ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Registos afectados</p>
              <ul className="list-disc space-y-1 pl-5">
                {impacts.map((item, idx) => (
                  <li key={idx}>
                    {item.count} {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {cannotDeleteReason ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {cannotDeleteReason}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </ModalContent>
        <ModalFooter
          onCancel={() => requestOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel="Eliminar definitivamente"
          submitVariant="destructive"
          isSubmitting={busy}
          disabled={Boolean(cannotDeleteReason)}
        />
      </form>
    </ModalShell>
  );
}
