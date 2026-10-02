import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DebouncedSearchInput } from "@/components/filters/debounced-search-input";

const selectClass =
  "h-11 min-w-0 w-full overflow-hidden text-ellipsis rounded-md border border-input bg-background px-3 text-base text-foreground sm:h-9 md:text-sm";

export type ListFilterOption = { value: string; label: string };

export type ListFilterField = {
  name: string;
  label?: string;
  type?: "search" | "select" | "date";
  placeholder?: string;
  options?: ListFilterOption[];
  emptyValue?: string;
  "aria-label"?: string;
};

export function ListFilterBar({
  fields,
  values,
  onChange,
  onReset,
  activeCount,
  extras,
  chips,
  className,
}: {
  fields: ListFilterField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onReset: () => void;
  activeCount: number;
  extras?: ReactNode;
  chips?: Array<{ name: string; label: string; value: string; emptyValue?: string }>;
  className?: string;
}) {
  const advancedId = useId();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const advancedFields = fields.filter((field) => field.type === "select" || field.type === "date");

  return (
    <div
      className={cn("rounded-lg border border-border bg-card p-3 sm:p-3.5 shadow-soft", className)}
    >
      <div className="flex flex-wrap items-end gap-2">
        {fields.map((field) => {
          const value = values[field.name] ?? "";
          if (field.type === "select") {
            return (
              <label
                key={field.name}
                id={`${advancedId}-${field.name}`}
                className={cn(
                  "block min-w-0 w-full overflow-hidden space-y-1 text-xs font-medium text-muted-foreground sm:w-auto",
                  !showAdvanced && "max-sm:hidden",
                )}
              >
                <span className="block">{field.label ?? "\u00a0"}</span>
                <select
                  value={value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  aria-label={field["aria-label"] ?? field.label ?? field.name}
                  className={cn(selectClass, "sm:min-w-[140px] sm:max-w-72")}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          if (field.type === "date") {
            return (
              <label
                key={field.name}
                id={`${advancedId}-${field.name}`}
                className={cn(
                  "block min-w-0 w-full space-y-1 text-xs font-medium text-muted-foreground sm:w-auto",
                  !showAdvanced && "max-sm:hidden",
                )}
              >
                <span className="block">{field.label ?? "Data"}</span>
                <Input
                  type="date"
                  value={value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  aria-label={field["aria-label"] ?? field.label ?? field.name}
                  className="h-9 min-w-0 w-full sm:w-[10.5rem]"
                />
              </label>
            );
          }
          return (
            <DebouncedSearchInput
              key={field.name}
              field={field}
              value={value}
              onChange={onChange}
            />
          );
        })}
        {advancedFields.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sm:hidden"
            aria-expanded={showAdvanced}
            aria-controls={advancedFields.map((field) => `${advancedId}-${field.name}`).join(" ")}
            onClick={() => setShowAdvanced((previous) => !previous)}
          >
            <SlidersHorizontal aria-hidden="true" />
            {showAdvanced ? "Ocultar filtros" : "Filtros"}
            {activeCount ? ` (${activeCount})` : ""}
          </Button>
        ) : null}
        {extras}
        <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={!activeCount}>
          Limpar{activeCount ? ` (${activeCount})` : ""}
        </Button>
      </div>
      {chips && chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.name}
              type="button"
              aria-label={`Remover filtro ${chip.label}: ${chip.value}`}
              onClick={() => onChange(chip.name, chip.emptyValue ?? "")}
              className="inline-flex min-w-0 max-w-full min-h-11 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary md:min-h-0"
            >
              <span className="[overflow-wrap:anywhere]">
                {chip.label}: {chip.value}
              </span>
              <X className="size-3 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
