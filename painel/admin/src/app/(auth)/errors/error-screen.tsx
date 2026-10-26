import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDocsUrl } from "@/lib/ecosystem-urls";

/**
 * Ecrã de erro do ADMIN. Substitui as páginas do template (imagem de
 * demonstração externa, texto em português do Brasil e botão «Fale Conosco»
 * que não levava a lado nenhum).
 */
export function ErrorScreen({
  code,
  title,
  description,
  icon: Icon,
  primary = { href: "/tenants", label: "Voltar às escolas" },
}: {
  code: string;
  title: string;
  description: string;
  icon: LucideIcon;
  primary?: { href: string; label: string };
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-7" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Erro {code}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
        <Button asChild variant="outline">
          <a href={getDocsUrl("/admin/control-center.html")} target="_blank" rel="noreferrer">
            Manual do ADMIN
          </a>
        </Button>
      </div>
    </main>
  );
}
