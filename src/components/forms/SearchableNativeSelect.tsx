import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt");

/** Filtering never changes the submitted selection. Keeps native keyboard/mobile behaviour. */
export function SearchableNativeSelect({
  id,
  name,
  label,
  options,
  defaultValue = "",
  required = true,
  placeholder,
  invalid,
  errorId,
  disabled = false,
}: {
  id: string;
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  invalid?: boolean;
  errorId?: string | undefined;
  /** Durante a gravação, como os outros campos do formulário. */
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(defaultValue);
  const selectRef = useRef<HTMLSelectElement>(null);
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  const matching = options.filter((option) =>
    words.every((word) => fold(option.label).includes(word)),
  );
  const chosen = options.find((option) => option.value === selected);
  const keepChosen = chosen && !matching.some((option) => option.value === chosen.value);
  const resultsId = `${id}-search-results`;
  return (
    <div className="mt-1 space-y-2">
      <Label htmlFor={`${id}-search`} className="text-xs font-normal text-muted-foreground">
        Procurar {label.toLocaleLowerCase("pt")}
      </Label>
      <Input
        id={`${id}-search`}
        type="search"
        placeholder="Escreva para filtrar a lista"
        aria-describedby={resultsId}
        disabled={disabled}
        value={query}
        onChange={(event) => {
          event.stopPropagation();
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          // Enter num campo de texto submete o formulário: gravaria a matrícula
          // com a turma anterior a meio da pesquisa. Passa o foco para a lista,
          // onde a escolha é explícita (e conta como alteração do formulário).
          if (event.key !== "Enter") return;
          event.preventDefault();
          selectRef.current?.focus();
        }}
      />
      <p id={resultsId} role="status" className="text-xs text-muted-foreground">
        {matching.length} de {options.length} opções.
        {matching.length === 0 ? " Nenhuma opção corresponde à pesquisa." : ""}
        {keepChosen ? " A selecção actual foi mantida." : ""}
      </p>
      <select
        ref={selectRef}
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={[resultsId, errorId].filter(Boolean).join(" ")}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9"
        value={chosen ? selected : ""}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="" disabled={required}>
          {placeholder ?? "Seleccione uma opção"}
        </option>
        {keepChosen ? <option value={chosen.value}>{chosen.label} (seleccionada)</option> : null}
        {matching.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
