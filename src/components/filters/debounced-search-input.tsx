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
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    // Teclados IME devem concluir a composição antes de pesquisar no servidor.
    if (draft === value || isComposing) return;
    const timer = window.setTimeout(() => onChange(field.name, draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value, field.name, onChange, isComposing]);

  return (
    <div className="min-w-0 flex-[2_1_100%] sm:flex-[2_1_200px]">
      {field.label ? (
        <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">{field.label}</p>
      ) : null}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(event) => {
            setDraft(event.currentTarget.value);
            setIsComposing(false);
          }}
          placeholder={field.placeholder ?? "Pesquisar…"}
          className="h-[44px] min-w-0 rounded-xl pl-[36px] text-[16px] lg:min-h-[44px] lg:text-[14px]"
          aria-label={field["aria-label"] ?? field.label ?? field.placeholder ?? "Pesquisar"}
        />
      </div>
    </div>
  );
}

export { DebouncedSearchInput, SEARCH_DEBOUNCE_MS };
