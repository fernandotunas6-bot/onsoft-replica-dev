import { ChevronDown, ExternalLink, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  return <DocPathHelpButton path="/guide/sql-sga.html" label={label} title={title} />;
}

/**
 * Vários artigos de ajuda num só botão "Ajuda ▾". Empilhar um botão por artigo no
 * cabeçalho ("Ajuda", "PayFlow", "SAFT-AO"…) competia com as acções da página.
 */
export function DocHelpMenu({
  items,
  label = "Ajuda",
}: {
  items: Array<{ label: string; path?: string; href?: string }>;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
          <HelpCircle className="size-3.5" /> {label}
          <ChevronDown className="size-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Documentação
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem key={item.label} asChild className="cursor-pointer gap-2 text-sm">
            <a
              href={item.href ?? (item.path ? getDocUrl(item.path) : getSigaNavDocUrl())}
              target="_blank"
              rel="noreferrer"
            >
              <span className="flex-1">{item.label}</span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
