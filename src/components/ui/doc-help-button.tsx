import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDocUrl, getSigaNavDocUrl } from "@/lib/ecosystem-urls";

/** Botão ghost que abre um artigo DOC (mapa de navegação por omissão). */
export function DocHelpButton({
  href,
  label = "Ajuda",
  title = "Abrir documentação",
}: {
  href?: string;
  label?: string;
  title?: string;
}) {
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 text-xs" asChild>
      <a href={href ?? getSigaNavDocUrl()} target="_blank" rel="noreferrer" title={title}>
        <HelpCircle className="size-3.5" /> {label}
      </a>
    </Button>
  );
}

/** Atalho tipado para caminhos DOC frequentes via `getDocUrl`. */
export function DocPathHelpButton({
  path,
  label = "Ajuda",
  title,
}: {
  path: string;
  label?: string;
  title?: string;
}) {
  return <DocHelpButton href={getDocUrl(path)} label={label} title={title} />;
}

/** Ajuda directa ao checklist SQL SGA. */
export function SqlDocHelpButton({
  label = "SQL SGA",
  title = "Checklist SQL do projecto SGA",
}: {
  label?: string;
  title?: string;
} = {}) {
  return (
    <DocPathHelpButton path="/guide/sql-sga.html" label={label} title={title} />
  );
}

