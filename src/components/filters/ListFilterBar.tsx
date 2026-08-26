import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DebouncedSearchInput } from "@/components/filters/debounced-search-input";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-xs md:text-sm text-foreground";

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
  return (
    <div
      className={cn("rounded-lg border border-border bg-card p-3 sm:p-3.5 shadow-xs", className)}
    >
      <div className="flex flex-wrap items-end gap-2">
        {fields.map((field) => {
          const value = values[field.name] ?? "";
          if (field.type === "select") {
            return (
              <label
                key={field.name}
                className="space-y-1 text-xs font-semibold text-muted-foreground"
              >
                {field.label ?? "\u00a0"}
                <select
                  value={value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  aria-label={field["aria-label"] ?? field.label ?? field.name}
                  className={cn(selectClass, "min-w-[140px]")}
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
                className="space-y-1 text-xs font-semibold text-muted-foreground"
              >
                {field.label ?? "Data"}
                <Input
                  type="date"
                  value={value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  aria-label={field["aria-label"] ?? field.label ?? field.name}
                  className="h-9 w-[10.5rem]"
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
        {extras}
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!activeCount}>
          Limpar{activeCount ? ` (${activeCount})` : ""}
        </Button>
      </div>
      {chips && chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.name}
              type="button"
              onClick={() => onChange(chip.name, chip.emptyValue ?? "")}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
            >
              {chip.label}: {chip.value}
              <X className="size-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
