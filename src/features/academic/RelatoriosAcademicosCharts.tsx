import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/layout/PageHeader";

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

export function RelatoriosAcademicosCharts({
  aproveitamentoPorClasse,
  mediaPorTrimestre,
  hasTermGrades,
}: {
  aproveitamentoPorClasse: Array<{ classe: string; aprovados: number; reprovados: number }>;
  mediaPorTrimestre: Array<{ trimestre: string; media: number }>;
  hasTermGrades: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Aproveitamento por classe" description="Aprovados vs. reprovados">
        {aproveitamentoPorClasse.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Lance notas na Área Pedagógica para alimentar este gráfico.
          </p>
        ) : (
          <div className="h-[280px]">
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
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="aprovados"
                  name="Aprovados"
                  fill="var(--chart-1)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={30}
                />
                <Bar
                  dataKey="reprovados"
                  name="Reprovados"
                  fill="var(--chart-4)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={30}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title="Evolução das médias" description="Média geral por trimestre">
        {!hasTermGrades ? (
          <p className="text-sm text-muted-foreground">
            Sem notas lançadas para calcular a evolução trimestral.
          </p>
        ) : (
          <div className="h-[280px]">
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
                  stroke="var(--chart-3)"
                  strokeWidth={3}
                  dot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}
