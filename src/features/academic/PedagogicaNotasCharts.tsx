import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

export type PedagogicaNotasChartsProps = {
  aproveitamentoPorClasse: Array<{ classe: string; aprovados: number; reprovados: number }>;
  mediaPorTrimestre: Array<{ trimestre: string; media: number }>;
  hasTermGrades: boolean;
};

export function PedagogicaNotasCharts({
  aproveitamentoPorClasse,
  mediaPorTrimestre,
  hasTermGrades,
}: PedagogicaNotasChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h3 className="text-base font-semibold">Aproveitamento por classe</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Percentagem de aprovados com base nas notas reais
        </p>
        {aproveitamentoPorClasse.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Sem dados suficientes para o gráfico.
          </p>
        ) : (
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aproveitamentoPorClasse}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="classe" {...axis} />
                <YAxis {...axis} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Bar
                  dataKey="aprovados"
                  fill="var(--chart-1)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={34}
                />
                <Bar
                  dataKey="reprovados"
                  fill="var(--chart-2)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={34}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h3 className="text-base font-semibold">Média por trimestre</h3>
        <p className="mt-1 text-sm text-muted-foreground">Evolução anual das notas lançadas</p>
        {!hasTermGrades ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Sem dados suficientes para o gráfico.
          </p>
        ) : (
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mediaPorTrimestre}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="trimestre" {...axis} />
                <YAxis domain={[0, 20]} {...axis} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="media"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
