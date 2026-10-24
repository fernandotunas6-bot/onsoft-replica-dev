import { useId, useMemo, useState } from "react";
import type { WebsiteField } from "../content-model";

export function StudioFields({
  fields,
  value,
  onChange,
  disabled,
  lockedKeys = [],
}: {
  fields: readonly WebsiteField[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled: boolean;
  lockedKeys?: readonly string[];
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      fields.filter((field) =>
        `${field.label} ${value[field.key] ?? field.value}`
          .toLocaleLowerCase("pt")
          .includes(search.toLocaleLowerCase("pt")),
      ),
    [fields, search, value],
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / 20) - 1);
  const current = Math.min(page, lastPage);
  return (
    <div className="studio-fields">
      <label htmlFor={`${id}-search`}>Procurar nesta secção</label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        placeholder="Texto, imagem ou ligação…"
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
      />
      <fieldset disabled={disabled}>
        {filtered.slice(current * 20, (current + 1) * 20).map((field) => {
          const fieldId = `${id}-${field.key}`;
          const text = value[field.key] ?? field.value;
          return (
            <div className="studio-field" key={field.key}>
              <label htmlFor={fieldId}>{field.label}</label>
              {field.kind === "text" &&
              (text.length > 100 || /descrição|resumo|corpo|parágrafo/i.test(field.label)) ? (
                <textarea
                  id={fieldId}
                  disabled={lockedKeys.includes(field.key)}
                  rows={4}
                  maxLength={12000}
                  value={text}
                  onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                />
              ) : (
                <input
                  id={fieldId}
                  disabled={lockedKeys.includes(field.key)}
                  type={field.kind === "number" ? "number" : "text"}
                  maxLength={12000}
                  value={text}
                  onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
                />
              )}
              {lockedKeys.includes(field.key) && (
                <small>
                  Nome ligado ao curso académico. Gerir a associação nas configurações completas.
                </small>
              )}
              {field.kind === "image" && (
                <small>Imagem pública estável, por caminho local ou HTTPS.</small>
              )}
              {field.kind === "asset" && (
                <small>Identificador de imagem do catálogo existente.</small>
              )}
            </div>
          );
        })}
      </fieldset>
      {!filtered.length && <p>Nenhum campo nesta pesquisa.</p>}
      {lastPage > 0 && (
        <div className="studio-pagination">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Anterior
          </button>
          <span>
            {current + 1} / {lastPage + 1}
          </span>
          <button
            type="button"
            disabled={current === lastPage}
            onClick={() => setPage(current + 1)}
          >
            Seguinte
          </button>
        </div>
      )}
    </div>
  );
}
