import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DebouncedSearchInput } from "@/components/filters/debounced-search-input";

const selectClass =
  "h-[44px] w-full min-w-0 rounded-xl border border-input bg-background px-3 text-[16px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-[14px]";

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
    <div className={cn("rounded-xl border border-border bg-card p-3 sm:p-4", className)}>
      <div className="flex flex-wrap items-end gap-2">
        {fields.map((field) => {
          const value = values[field.name] ?? "";
          if (field.type === "select") {
            return (
              <label
                key={field.name}
                className="flex min-w-0 flex-[1_1_100%] sm:flex-[1_1_140px] flex-col gap-1.5 text-[12px] font-medium text-muted-foreground"
              >
                {field.label ?? "\u00a0"}
                <select
                  value={value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  aria-label={field["aria-label"] ?? field.label ?? field.name}
                  className={selectClass}
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
                className="flex min-w-0 flex-[1_1_100%] sm:flex-[1_1_140px] flex-col gap-1.5 text-[12px] font-medium text-muted-foreground"
              >
                {field.label ?? "Data"}
                <Input
                  type="date"
                  value={value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  aria-label={field["aria-label"] ?? field.label ?? field.name}
                  className="h-[44px] w-full min-w-0 rounded-xl text-[16px] lg:min-h-[44px] lg:text-[14px]"
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
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] text-[13px]"
          onClick={onReset}
          disabled={!activeCount}
        >
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
              aria-label={`Remover filtro ${chip.label}: ${chip.value}`}
              className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-left text-[12px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 break-words">
                {chip.label}: {chip.value}
              </span>
              <X className="size-[16px] shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
