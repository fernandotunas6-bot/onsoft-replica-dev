import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Banknote, Plus, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { caixaResumo, kwanza, mensalidadesPorMes, movimentos } from "@/lib/modules-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Caixa e Pagamentos · SIGA" },
      {
        name: "description",
        content:
          "Movimentos de caixa, entradas de mensalidades, despesas e cobrança mensal da escola em kwanzas.",
      },
      { property: "og:title", content: "Caixa e Pagamentos · SIGA" },
      {
        property: "og:description",
        content: "Controle entradas, saídas e saldo do caixa escolar em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FinanceiroPage,
});

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

function FinanceiroPage() {
  const [tipo, setTipo] = useState("todos");
  const saldo = caixaResumo.saldoInicial + caixaResumo.entradas - caixaResumo.saidas;
  const lista = movimentos.filter((m) => tipo === "todos" || m.tipo === tipo);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Financeiro"
          title="Caixa e Pagamentos"
          description="Registo diário de entradas e saídas, métodos de pagamento e evolução da cobrança."
          actions={
            <>
              <Button variant="outline" className="gap-2">
                <Banknote className="size-4" /> Fechar caixa
              </Button>
              <Button className="gap-2">
                <Plus className="size-4" /> Registar pagamento
              </Button>
            </>
          }
        />

        <StatGrid
          items={[
            { label: "Saldo actual", value: kwanza(saldo), hint: "Caixa + banco" },
            { label: "Entradas do mês", value: kwanza(caixaResumo.entradas), hint: "Maio de 2025" },
            {
              label: "Saídas do mês",
              value: kwanza(caixaResumo.saidas),
              hint: "Despesas e salários",
            },
            { label: "Taxa de cobrança", value: "71%", hint: "Mensalidades de Maio" },
          ]}
        />

        <Panel title="Cobrado vs. recebido" description="Mensalidades ao longo do ano lectivo">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mensalidadesPorMes}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" {...axis} />
                <YAxis
                  {...axis}
                  tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}M`}
                  width={40}
                />
                <Tooltip
                  formatter={(v) => kwanza(Number(v))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="cobrado"
                  name="Cobrado"
                  fill="var(--chart-2)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={26}
                />
                <Bar
                  dataKey="recebido"
                  name="Recebido"
                  fill="var(--chart-1)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Movimentos de caixa"
          description="Últimos lançamentos registados"
          action={
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              aria-label="Filtrar por tipo de movimento"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="todos">Todos os movimentos</option>
              <option value="Entrada">Apenas entradas</option>
              <option value="Saída">Apenas saídas</option>
            </select>
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(m.data).toLocaleDateString("pt-PT")}
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold">{m.descricao}</p>
                      {m.aluno ? <p className="text-xs text-muted-foreground">{m.aluno}</p> : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.categoria}</TableCell>
                    <TableCell>
                      <span className={cn(badgeBase, toneClass.muted)}>{m.metodo}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          badgeBase,
                          "gap-1",
                          m.tipo === "Entrada" ? toneClass.success : toneClass.danger,
                        )}
                      >
                        {m.tipo === "Entrada" ? (
                          <ArrowUpRight className="size-3" />
                        ) : (
                          <ArrowDownRight className="size-3" />
                        )}
                        {m.tipo}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-bold",
                        m.tipo === "Entrada" ? "text-success" : "text-destructive",
                      )}
                    >
                      {m.tipo === "Entrada" ? "+" : "−"} {kwanza(m.valor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-primary-soft/40 p-5">
          <Wallet className="size-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            Saldo inicial do período:{" "}
            <strong className="text-foreground">{kwanza(caixaResumo.saldoInicial)}</strong>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
