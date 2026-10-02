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
import { cn } from "@/lib/utils";

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
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            {subject ? (
              <span className="block rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-medium text-foreground">
                {subject}
              </span>
            ) : null}
            <span className="block">{description ?? "Esta acção não poderá ser desfeita."}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="h-11 sm:h-10">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              "h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:h-10",
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
