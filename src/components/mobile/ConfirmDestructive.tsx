import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Confirmação de acção destrutiva (§55, §105).
 *
 * Duas regras que mudam o desenho:
 *
 * - **O contexto vem no diálogo.** "Eliminar aluno?" não basta; a pergunta diz
 *   *qual* aluno, *qual* turma, *qual* trimestre. Uma confirmação vaga é tão má
 *   como nenhuma, porque o utilizador diz "sim" sem saber a quê.
 * - **O vermelho só aparece no botão que destrói.** Pintar o diálogo todo de
 *   vermelho antes da decisão treina o olho a ignorá-lo.
 */
export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  /** O objecto concreto: "Ana Manuel · 10ª A" — nunca só o tipo. */
  subject,
  description,
  confirmLabel = "Eliminar",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[440px] rounded-2xl">
        <AlertDialogHeader className="min-w-0 gap-2 text-left">
          <AlertDialogTitle className="break-words text-[18px] leading-[24px]">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-[13px] leading-[24px]">
            {subject ? (
              <span className="block break-words rounded-xl border border-border bg-secondary px-3 py-3 text-[14px] font-medium leading-[24px] text-foreground">
                {subject}
              </span>
            ) : null}
            <span className="block break-words">
              {description ?? "Esta acção não poderá ser desfeita."}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="mt-0 h-auto min-h-[44px] whitespace-normal break-words rounded-xl px-4 py-3 text-[14px] leading-[20px] lg:min-h-[44px]">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="h-auto min-h-[44px] whitespace-normal break-words rounded-xl bg-destructive px-4 py-3 text-[14px] leading-[20px] text-destructive-foreground hover:bg-destructive/90 lg:min-h-[44px]"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
