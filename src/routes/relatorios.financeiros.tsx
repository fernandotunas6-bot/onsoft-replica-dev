import { createFileRoute } from "@tanstack/react-router";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  despesaPorCategoria,
  kwanza,
  mensalidadesPorMes,
  receitaPorCategoria,
} from "@/lib/modules-data";

export const Route = createFileRoute("/relatorios/financeiros")({
  head: () => ({
    meta: [
      { title: "Relatórios Financeiros · SIGA" },
      {
        name: "description",
        content:
          "Receitas por categoria, despesas, margem operacional e evolução da cobrança de mensalidades da escola.",
      },
      { property: "og:title", content: "Relatórios Financeiros · SIGA" },
      {
        property: "og:description",
        content: "Analise receitas, despesas e resultado do ano lectivo com gráficos claros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelatoriosFinanceiros,
});

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

function RelatoriosFinanceiros() {
  const receita = receitaPorCategoria.reduce((s, r) => s + r.valor, 0);
  const despesa = despesaPorCategoria.reduce((s, r) => s + r.valor, 0);
  const resultado = receita - despesa;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Relatórios"
          title="Relatórios Financeiros"
          description="Resultado do ano lectivo, composição das receitas e estrutura de custos da instituição."
          actions={
            <Button variant="outline" className="gap-2">
              <Download className="size-4" /> Exportar PDF
            </Button>
          }
        />

        <StatGrid
          items={[
            { label: "Receita total", value: kwanza(receita), hint: "Ano lectivo 2024/2025" },
            { label: "Despesa total", value: kwanza(despesa), hint: "Salários incluídos" },
            {
              label: "Resultado",
              value: kwanza(resultado),
              hint: `Margem de ${Math.round((resultado / receita) * 100)}%`,
            },
            { label: "Dívida acumulada", value: kwanza(4820000), hint: "Mensalidades em atraso" },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Receitas por categoria" description="Distribuição das entradas">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={receitaPorCategoria}
                    dataKey="valor"
                    nameKey="categoria"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                  >
                    {receitaPorCategoria.map((_, i) => (
                      <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v) => kwanza(Number(v))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Despesas por categoria" description="Onde o orçamento é aplicado">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={despesaPorCategoria} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    {...axis}
                    tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}M`}
                  />
                  <YAxis type="category" dataKey="categoria" width={120} {...axis} />
                  <Tooltip
                    formatter={(v) => kwanza(Number(v))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar
                    dataKey="valor"
                    fill="var(--chart-4)"
                    radius={[0, 8, 8, 0]}
                    maxBarSize={26}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <Panel title="Cobrança mensal" description="Cobrado, recebido e desvio por mês">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Cobrado</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Desvio</TableHead>
                  <TableHead className="text-right">Eficiência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mensalidadesPorMes.map((m) => {
                  const desvio = m.recebido - m.cobrado;
                  const eficiencia = Math.round((m.recebido / m.cobrado) * 100);
                  return (
                    <TableRow key={m.mes}>
                      <TableCell className="font-semibold">{m.mes}</TableCell>
                      <TableCell className="text-right">{kwanza(m.cobrado)}</TableCell>
                      <TableCell className="text-right">{kwanza(m.recebido)}</TableCell>
                      <TableCell className="text-right text-destructive">
                        {kwanza(desvio)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          {eficiencia >= 90 ? (
                            <TrendingUp className="size-4 text-success" />
                          ) : (
                            <TrendingDown className="size-4 text-destructive" />
                          )}
                          {eficiencia}%
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
