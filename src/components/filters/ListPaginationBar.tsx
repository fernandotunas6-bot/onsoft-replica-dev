import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ListPaginationBarProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function ListPaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = "",
}: ListPaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  if (totalItems <= pageSize && !onPageSizeChange) {
    return null;
  }

  return (
    <nav
      aria-label="Paginação da lista"
      className={`flex min-w-0 flex-col gap-3 border-t border-border bg-card/40 px-3 py-3 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4 ${className}`}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span role="status" aria-live="polite" aria-atomic="true">
          Mostrando{" "}
          <strong className="font-semibold text-foreground">{`${startItem}–${endItem}`}</strong> de{" "}
          <strong className="font-semibold text-foreground">{totalItems}</strong> registo
          {totalItems === 1 ? "" : "s"}
        </span>

        {onPageSizeChange ? (
          <div className="flex items-center gap-1.5">
            <span>Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-11 rounded-md border border-input bg-background px-2 text-base font-medium text-foreground md:h-7 md:text-xs"
              aria-label="Itens por página"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-1 sm:justify-end">
        <Button
          variant="outline"
          size="icon"
          type="button"
          className="size-11 md:size-7"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          aria-label="Primeira página"
        >
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          type="button"
          className="size-11 md:size-7"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-3.5" />
        </Button>

        <span
          className="whitespace-nowrap px-2 font-medium tabular-nums text-foreground"
          aria-label={`Página ${currentPage} de ${totalPages}`}
        >
          {currentPage} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="icon"
          type="button"
          className="size-11 md:size-7"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Página seguinte"
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          type="button"
          className="size-11 md:size-7"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          aria-label="Última página"
        >
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </nav>
  );
}
