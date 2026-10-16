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
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 text-[12px] text-muted-foreground ${className}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          Mostrando{" "}
          <strong className="font-semibold text-foreground">{`${startItem}–${endItem}`}</strong> de{" "}
          <strong className="font-semibold text-foreground">{totalItems}</strong> registo
          {totalItems === 1 ? "" : "s"}
        </span>

        {onPageSizeChange ? (
          <div className="flex max-w-full flex-wrap items-center gap-1.5">
            <span>Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-[44px] rounded-xl border border-input bg-background px-3 text-[16px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[14px]"
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

      <div className="flex max-w-full flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-[44px] shrink-0 rounded-xl"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          aria-label="Primeira página"
        >
          <ChevronsLeft className="size-[18px]" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-[44px] shrink-0 rounded-xl"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-[18px]" />
        </Button>

        <span className="px-2 font-medium tabular-nums text-foreground">
          {currentPage} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="icon"
          className="size-[44px] shrink-0 rounded-xl"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Página seguinte"
        >
          <ChevronRight className="size-[18px]" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-[44px] shrink-0 rounded-xl"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          aria-label="Última página"
        >
          <ChevronsRight className="size-[18px]" />
        </Button>
      </div>
    </div>
  );
}
