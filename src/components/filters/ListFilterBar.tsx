import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DebouncedSearchInput } from "@/components/filters/debounced-search-input";

/*
 * Seletor com o aspecto dos campos de texto e a mesma altura da pesquisa. A seta e o
 * peso normal vêm da regra global de `select` (styles.css).
 */
const selectClass =
  "h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm font-normal text-foreground shadow-subtle transition-colors hover:border-foreground/25 focus-visible:border-ring";

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
    // Barra sobre a tabela, sem cartão próprio. No telemóvel: pesquisa a toda a largura e
    // os filtros dois a dois; a partir de sm, tudo numa linha.
    <div className={cn("space-y-2.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {fields.map((field) => {
          const value = values[field.name] ?? "";
          if (field.type === "select") {
            return (
              // O rótulo fica para leitores de ecrã: a 1.ª opção ("Todos os estados") já
              // diz o que o filtro é, e o chip activo repete "Estado: …".
              <label
                key={field.name}
                className="relative min-w-[calc(50%-0.25rem)] flex-1 sm:min-w-[150px] sm:flex-none"
              >
                <span className="sr-only">{field.label ?? field.name}</span>
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
                className="flex min-w-[calc(50%-0.25rem)] flex-1 items-center gap-2 text-xs text-muted-foreground sm:min-w-0 sm:flex-none"
              >
                <span className="shrink-0">{field.label ?? "Data"}</span>
                <Input
                  type="date"
                  value={value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  aria-label={field["aria-label"] ?? field.label ?? field.name}
                  className="h-9 w-full sm:w-[10.5rem]"
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
        {activeCount ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-9 text-muted-foreground hover:text-foreground"
          >
            Limpar ({activeCount})
          </Button>
        ) : null}
      </div>
      {chips && chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.name}
              type="button"
              onClick={() => onChange(chip.name, chip.emptyValue ?? "")}
              aria-label={`Remover filtro ${chip.label}: ${chip.value}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
            >
              <span className="text-muted-foreground">{chip.label}</span>
              {chip.value}
              <X className="size-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
