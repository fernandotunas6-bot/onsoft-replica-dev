import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileCheck2, FilePlus2, Printer, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { documentos, kwanza, modelosDocumento } from "@/lib/modules-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos e Declarações · SIGA" },
      {
        name: "description",
        content:
          "Emissão e acompanhamento de declarações, certificados, boletins e pedidos de transferência dos alunos.",
      },
      { property: "og:title", content: "Documentos e Declarações · SIGA" },
      {
        property: "og:description",
        content: "Acompanhe pedidos de documentos, prazos e taxas de emissão da secretaria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentosPage,
});

const estadoTone = {
  Emitido: toneClass.success,
  "Em processamento": toneClass.info,
  "Pendente de pagamento": toneClass.warning,
} as const;

function DocumentosPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documentos;
    return documentos.filter(
      (d) =>
        d.aluno.toLowerCase().includes(q) ||
        d.tipo.toLowerCase().includes(q) ||
        d.processo.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Secretaria"
          title="Documentos"
          description="Pedidos de declarações e certificados, com estado de emissão e taxas associadas."
          actions={
            <>
              <Button variant="outline" className="gap-2">
                <Printer className="size-4" /> Imprimir lote
              </Button>
              <Button className="gap-2">
                <FilePlus2 className="size-4" /> Novo pedido
              </Button>
            </>
          }
        />

        <StatGrid
          items={[
            { label: "Pedidos do mês", value: String(documentos.length), hint: "Maio de 2025" },
            {
              label: "Emitidos",
              value: String(documentos.filter((d) => d.estado === "Emitido").length),
              hint: "Prontos para entrega",
            },
            {
              label: "Em processamento",
              value: String(documentos.filter((d) => d.estado === "Em processamento").length),
              hint: "Dentro do prazo",
            },
            {
              label: "Aguardam pagamento",
              value: String(documentos.filter((d) => d.estado === "Pendente de pagamento").length),
              hint: "Tesouraria",
            },
          ]}
        />

        <Panel
          title="Pedidos de documentos"
          description="Todos os pedidos registados na secretaria"
          action={
            <div className="relative w-full min-w-[220px] sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar por aluno ou tipo…"
                className="pl-9"
                aria-label="Pesquisar documento"
              />
            </div>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Processo</TableHead>
                  <TableHead>Pedido em</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-semibold">
                      <span className="flex items-center gap-2">
                        <FileCheck2 className="size-4 text-primary" />
                        {d.tipo}
                      </span>
                    </TableCell>
                    <TableCell>{d.aluno}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {d.processo}
                    </TableCell>
                    <TableCell>{new Date(d.pedidoEm).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.responsavel}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn(badgeBase, estadoTone[d.estado])}>{d.estado}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel title="Modelos disponíveis" description="Taxas e prazos de emissão">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modelosDocumento.map((m) => (
              <div key={m.nome} className="rounded-xl border border-border p-4">
                <p className="font-semibold">{m.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">Prazo: {m.prazo}</p>
                <p className="mt-3 font-display text-xl font-extrabold text-primary">
                  {kwanza(m.preco)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
