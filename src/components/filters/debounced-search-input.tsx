import { useEffect, useState } from "react";
import type { ListFilterField } from "@/components/filters/ListFilterBar";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const SEARCH_DEBOUNCE_MS = 220;

function DebouncedSearchInput({
  field,
  value,
  onChange,
}: {
  field: ListFilterField;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(field.name, draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value, field.name, onChange]);

  return (
    <div className="min-w-0 w-full flex-1 basis-full sm:min-w-[200px] sm:w-auto sm:basis-0">
      {field.label ? (
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{field.label}</p>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={field.placeholder ?? "Pesquisar…"}
          type="search"
          className="h-9 min-w-0 pl-8.5 text-base md:text-sm"
          aria-label={field["aria-label"] ?? field.placeholder ?? "Pesquisar"}
        />
      </div>
    </div>
  );
}

export { DebouncedSearchInput, SEARCH_DEBOUNCE_MS };
