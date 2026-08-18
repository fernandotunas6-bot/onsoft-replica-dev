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
import { kwanza } from "@/lib/currency";

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

export function FinanceiroCashChart({
  data,
}: {
  data: Array<{ mes: string; cobrado: number; recebido: number }>;
}) {
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
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
  );
}
