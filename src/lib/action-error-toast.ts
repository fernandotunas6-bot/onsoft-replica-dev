import { toast } from "@/lib/toast";
import { errorParts, guidanceFor } from "@/lib/error-guidance";
import { formatMutationError } from "@/lib/format-error";
import { isTechnicalMessage } from "@/lib/public-error";
import { reportPossibleStepUp } from "@/lib/step-up";
import { reportPossibleSessionError } from "@/lib/session-expiry";

/**
 * Erro de uma acção (gravar, apagar, emitir…), com a correcção e o botão para
 * o sítio onde se resolve (`error-guidance.ts`).
 *
 * `fallback` é a frase do ecrã («Não foi possível guardar a turma.»): sai
 * quando o erro não traz mensagem ou só traz texto técnico sem regra.
 */
export function toastActionError(error: unknown, fallback: string) {
  // O diálogo «Confirme que é você» já explica; um aviso de erro por cima só confundia.
  if (reportPossibleStepUp(error)) return;
  // Sessão expirada: o ecrã de entrada já diz o que fazer.
  if (reportPossibleSessionError(error)) return;
  const { message, code } = errorParts(error);
  const text = message ? formatMutationError(new Error(message), fallback) : "";
  // Um erro só com código Postgres (sem texto útil) ainda tem regra própria.
  const byCode = !text && code ? guidanceFor({ code }) : null;
  if (byCode) {
    toast.error(byCode.title ?? fallback, { description: byCode.fix });
    return;
  }
  if (!text || (isTechnicalMessage(text) && !guidanceFor({ message: text, code }))) {
    toast.error(fallback);
    return;
  }
  toast.error(text);
}
