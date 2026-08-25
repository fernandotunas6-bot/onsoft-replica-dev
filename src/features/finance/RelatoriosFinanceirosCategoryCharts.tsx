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
import { Panel } from "@/components/layout/PageHeader";
import { kwanza } from "@/lib/currency";

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

export function RelatoriosFinanceirosCategoryCharts({
  sentido,
  receitaPorCategoria,
  despesaPorCategoria,
}: {
  sentido: string;
  receitaPorCategoria: Array<{ categoria: string; valor: number }>;
  despesaPorCategoria: Array<{ categoria: string; valor: number }>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {sentido !== "despesa" ? (
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
      ) : null}

      {sentido !== "receita" ? (
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
                <Bar dataKey="valor" fill="var(--chart-4)" radius={[0, 8, 8, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export function RelatoriosFinanceirosMonthlyChart({
  monthly,
}: {
  monthly: Array<{ mes: string; receita: number; despesa: number }>;
}) {
  return (
    <Panel title="Receitas vs Despesas" description="Evolução mensal do caixa">
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="mes" {...axis} />
            <YAxis {...axis} tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}M`} />
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
              dataKey="receita"
              name="Receitas"
              fill="var(--success)"
              radius={[6, 6, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="despesa"
              name="Despesas"
              fill="var(--destructive)"
              radius={[6, 6, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
