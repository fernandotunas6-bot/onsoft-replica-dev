import { useState } from "react";
import {
  builtInThemes,
  parseWebsiteDesign,
  type Appearance,
} from "../../../../painel/escolas/src/design.mjs";
import { designOptionGroups } from "../website-design-options";
import type { WebsiteDraft } from "../content-model";

const pageControls = designOptionGroups
  .flatMap((group) => group.controls)
  .filter((control) =>
    ["contentWidth", "sectionSpacing", "buttonShape", "textScale", "textAlign"].includes(
      control.key,
    ),
  );
export function StudioAppearance({
  draft,
  path,
  disabled,
  onChange,
}: {
  draft: WebsiteDraft;
  path: string;
  disabled: boolean;
  onChange: (draft: WebsiteDraft) => void;
}) {
  const [error, setError] = useState("");
  const design =
    draft.design ??
    parseWebsiteDesign({ activeTheme: "campus", installedThemes: [], overrides: {}, pages: {} });
  const commit = (value: unknown) => {
    try {
      onChange({ ...draft, design: parseWebsiteDesign(value) });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A aparência não é válida.");
    }
  };
  const theme =
    [...builtInThemes, ...design.installedThemes].find((item) => item.id === design.activeTheme) ??
    builtInThemes[0];
  const options = design.pages[path] ?? {};
  const change = (key: keyof Appearance, value: string) =>
    commit({ ...design, pages: { ...design.pages, [path]: { ...options, [key]: value } } });
  return (
    <fieldset className="studio-appearance" disabled={disabled}>
      {error && <p role="alert">{error}</p>}
      <label htmlFor="studio-theme">Tema de todo o website</label>
      <select
        id="studio-theme"
        value={design.activeTheme}
        onChange={(event) => commit({ ...design, activeTheme: event.target.value })}
      >
        {[...builtInThemes, ...design.installedThemes].map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <h3>Aparência desta página</h3>
      <p>As alterações seguintes aplicam-se a {path}.</p>
      {(
        [
          ["primary", "Cor principal"],
          ["background", "Fundo"],
        ] as const
      ).map(([key, label]) => (
        <div className="studio-color" key={key}>
          <label htmlFor={`studio-${key}`}>{label}</label>
          <input
            id={`studio-${key}`}
            type="color"
            value={options[key] ?? design.overrides[key] ?? theme.appearance[key]}
            onChange={(event) => change(key, event.target.value)}
          />
        </div>
      ))}
      {pageControls.map((control) => (
        <div className="studio-field" key={control.key}>
          <label htmlFor={`studio-design-${control.key}`}>{control.label}</label>
          <select
            id={`studio-design-${control.key}`}
            value={String(options[control.key] ?? "inherit")}
            onChange={(event) => {
              if (event.target.value !== "inherit") return change(control.key, event.target.value);
              const next = { ...options };
              delete next[control.key];
              commit({ ...design, pages: { ...design.pages, [path]: next } });
            }}
          >
            <option value="inherit">Herdar do tema</option>
            {Object.entries(control.values).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const next = { ...design.pages };
          delete next[path];
          commit({ ...design, pages: next });
        }}
      >
        Repor aparência desta página
      </button>
    </fieldset>
  );
}
