import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  validateWebsiteDraft,
  websiteTemplate,
  type WebsiteDraft,
  type WebsiteState,
} from "../content-model";
import { IDENTITY_PAGES } from "../site-scope";
import { studioPages } from "./adapter";

export function PublicationReview({
  draft,
  state,
  schoolName,
  onClose,
  onConfirm,
  onReturnFocus,
}: {
  draft: WebsiteDraft;
  state: WebsiteState;
  schoolName: string;
  onClose: () => void;
  onConfirm: () => void;
  onReturnFocus: () => void;
}) {
  const review = useMemo(() => {
    try {
      validateWebsiteDraft(draft);
      const before = state.published?.content;
      const fields = websiteTemplate.fields.filter(
        (field) =>
          (draft.values[field.key] ?? field.value) !== (before?.values[field.key] ?? field.value),
      ).length;
      const count =
        draft.adoptedPages === undefined
          ? studioPages.length
          : studioPages.filter(
              (page) =>
                (IDENTITY_PAGES as readonly string[]).includes(page.url) ||
                draft.adoptedPages?.includes(page.url),
            ).length;
      return { fields, count, error: "" };
    } catch (cause) {
      return {
        fields: 0,
        count: 0,
        error: cause instanceof Error ? cause.message : "O conteúdo não é válido.",
      };
    }
  }, [draft, state.published]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Rever publicação</DialogTitle>
          <DialogDescription>
            Vai publicar o rascunho actual de {schoolName}, incluindo alterações por guardar.
          </DialogDescription>
        </DialogHeader>
        {review.error ? (
          <p role="alert">{review.error}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {review.count} páginas incluídas ·{" "}
              {state.published
                ? `${review.fields} campos diferentes da publicação anterior.`
                : "Primeira publicação desta escola."}
            </p>
            <p>
              Revisão de partida: {state.revision}. Temas, ligações e âmbito de páginas também fazem
              parte do rascunho.
            </p>
            <p>
              O servidor volta a verificar a sessão, a escola, o acesso, a revisão e a autenticação
              exigida.
            </p>
          </div>
        )}
        <DialogFooter>
          <button type="button" className="min-h-11 rounded-lg border px-4" onClick={onClose}>
            Continuar a editar
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50"
            disabled={Boolean(review.error)}
            onClick={onConfirm}
          >
            Confirmar publicação
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
