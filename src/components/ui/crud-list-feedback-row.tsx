import { AlertCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableCell, TableRow } from "@/components/ui/table";

export type CrudListFeedbackKind = "error" | "empty" | "filtered" | "forbidden" | "conflict";

export interface CrudListFeedbackRowProps {
  /** Número exacto de colunas da tabela, para manter a semântica do HTML. */
  colSpan: number;
  kind: CrudListFeedbackKind;
  /** Nome plural, por exemplo «pessoas» ou «professores». */
  entityLabel: string;
  onRetry?: () => void;
  onClearFilters?: () => void;
}

/**
 * Estados de listagem partilhados: uma falha nunca se apresenta como lista vazia.
 * Mensagens técnicas e dados sensíveis não são apresentados na interface.
 * A decisão de autorização pertence ao servidor; este componente só a comunica.
 */
export function CrudListFeedbackRow({
  colSpan,
  kind,
  entityLabel,
  onRetry,
  onClearFilters,
}: CrudListFeedbackRowProps) {
  if (kind === "empty" || kind === "filtered") {
    const filtered = kind === "filtered";
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="p-4">
          <EmptyState
            compact
            title={
              filtered
                ? "Nenhum resultado para os filtros aplicados"
                : `Ainda não existem ${entityLabel}`
            }
            description={
              filtered
                ? "Experimente alterar os critérios ou limpar os filtros."
                : "Os registos aparecerão aqui quando estiverem disponíveis."
            }
            actionLabel={filtered && onClearFilters ? "Limpar filtros" : undefined}
            onAction={filtered ? onClearFilters : undefined}
          />
        </TableCell>
      </TableRow>
    );
  }

  const isError = kind === "error";
  const isConflict = kind === "conflict";
  const title = isError
    ? `Não foi possível carregar ${entityLabel}.`
    : isConflict
      ? "Os registos foram alterados durante esta operação."
      : "Não tem permissão para consultar estes registos.";
  const description = isError
    ? "Verifique a ligação e tente novamente. Os dados não foram apagados."
    : isConflict
      ? "Actualize a listagem antes de continuar, para evitar substituir alterações de outra pessoa."
      : "Solicite acesso a um responsável autorizado da escola.";
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="p-4">
        <div
          role={kind === "forbidden" ? "status" : "alert"}
          className="flex flex-col items-center px-4 py-6 text-center"
        >
          {kind === "forbidden" ? (
            <LockKeyhole aria-hidden="true" className="mb-3 size-6 text-muted-foreground" />
          ) : (
            <AlertCircle aria-hidden="true" className="mb-3 size-6 text-destructive" />
          )}
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
          {onRetry && kind !== "forbidden" ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11 gap-2"
              onClick={onRetry}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              {isConflict ? "Actualizar listagem" : "Tentar novamente"}
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
