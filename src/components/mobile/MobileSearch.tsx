import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Campo de pesquisa das listas (§21). Debounce de 250ms: a pesquisa por nome
 * numa lista de milhares de alunos dispara um pedido por tecla sem isto.
 *
 * `type="search"` e `enterKeyHint="search"` fazem o teclado do telemóvel
 * mostrar a lupa em vez de "Enter", e o iOS desenha o X de limpar.
 */
export function MobileSearch({
  value,
  onChange,
  placeholder = "Pesquisar…",
  className,
  autoFocus = false,
  delay = 250,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  delay?: number;
}) {
  const [draft, setDraft] = React.useState(value);
  const timer = React.useRef<number>(0);

  // O valor externo pode mudar sem ser por escrita (limpar um chip, voltar à
  // lista com o filtro preservado). Nesse caso o campo tem de acompanhar.
  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const push = (next: string) => {
    setDraft(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange(next), delay);
  };

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={draft}
        onChange={(event) => push(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            window.clearTimeout(timer.current);
            setDraft("");
            onChange("");
          }}
          aria-label="Limpar pesquisa"
          className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
