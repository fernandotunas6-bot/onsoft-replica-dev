import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Plus, Printer, Search } from "lucide-react";
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
import { faturas, kwanza } from "@/lib/modules-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/faturas")({
  head: () => ({
    meta: [
      { title: "Faturas · SIGA" },
      {
        name: "description",
        content:
          "Emissão e controlo de faturas de mensalidades, matrículas e serviços, com estado de pagamento e vencimentos.",
      },
      { property: "og:title", content: "Faturas · SIGA" },
      {
        property: "og:description",
        content: "Consulte faturas pagas, pendentes e vencidas de cada aluno da escola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaturasPage,
});

const estadoTone = {
  Paga: toneClass.success,
  Pendente: toneClass.warning,
  Vencida: toneClass.danger,
} as const;

function FaturasPage() {
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState("todos");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faturas.filter(
      (f) =>
        (estado === "todos" || f.estado === estado) &&
        (!q || f.aluno.toLowerCase().includes(q) || f.numero.toLowerCase().includes(q)),
    );
  }, [query, estado]);

  const total = faturas.reduce((s, f) => s + f.valor, 0);
  const pago = faturas.filter((f) => f.estado === "Paga").reduce((s, f) => s + f.valor, 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Relatórios"
          title="Faturas"
          description="Documentos de cobrança emitidos, com vencimento, valor e estado de liquidação."
          actions={
            <>
              <Button variant="outline" className="gap-2">
                <Printer className="size-4" /> Imprimir
              </Button>
              <Button className="gap-2">
                <Plus className="size-4" /> Emitir factura
              </Button>
            </>
          }
        />

        <StatGrid
          items={[
            { label: "Facturado", value: kwanza(total), hint: `${faturas.length} documentos` },
            { label: "Liquidado", value: kwanza(pago), hint: "Recebido em caixa" },
            { label: "Em aberto", value: kwanza(total - pago), hint: "Pendente + vencido" },
            {
              label: "Vencidas",
              value: String(faturas.filter((f) => f.estado === "Vencida").length),
              hint: "Necessitam cobrança",
            },
          ]}
        />

        <Panel
          title="Documentos emitidos"
          description="Facturas de mensalidades e serviços"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full min-w-[200px] sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pesquisar número ou aluno…"
                  className="pl-9"
                  aria-label="Pesquisar factura"
                />
              </div>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                aria-label="Filtrar por estado da factura"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="todos">Todos os estados</option>
                <option value="Paga">Pagas</option>
                <option value="Pendente">Pendentes</option>
                <option value="Vencida">Vencidas</option>
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Emitida</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">
                      <span className="flex items-center gap-2">
                        <FileText className="size-4 text-primary" />
                        {f.numero}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{f.aluno}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.descricao}</TableCell>
                    <TableCell>{new Date(f.emitida).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell>{new Date(f.vencimento).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell className="text-right font-bold">{kwanza(f.valor)}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn(badgeBase, estadoTone[f.estado])}>{f.estado}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
