import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IconChip } from "@/components/ui/icon-chip";
import { LazyVisible } from "@/components/ui/lazy-visible";
import { inferIcon } from "@/lib/auto-icon";
import { kwanza } from "@/lib/currency";

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
} as const;

export type DashboardChartsProps = {
  loading: boolean;
  totalStudents: number;
  capabilities: {
    students: boolean;
    finance: boolean;
  };
  studentsByClass: Array<{ classe: string; alunos: number }>;
  genderSplit: Array<{ name: string; value: number }>;
  enrollmentsByMonth: Array<{ mes: string; matriculas: number }>;
  financeMonthly: Array<{ month: string | null; billed: number; received: number }>;
  finance: { invoice_count: number } | null | undefined;
  attendanceAverage: number | null | undefined;
};

function ChartCard({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconChip {...inferIcon(title)} size="sm" />
          <h2 className="truncate text-base font-semibold">{title}</h2>
        </div>
        {meta ? <span className="shrink-0 text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      <LazyVisible minHeight={200}>{children}</LazyVisible>
    </section>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function DashboardCharts({
  loading,
  totalStudents,
  capabilities,
  studentsByClass,
  genderSplit,
  enrollmentsByMonth,
  financeMonthly,
  finance,
  attendanceAverage,
}: DashboardChartsProps) {
  const enrollTotal = enrollmentsByMonth.reduce((sum, item) => sum + item.matriculas, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Estudantes por classe"
          meta={
            capabilities.students
              ? `${totalStudents} estudantes registados`
              : "Sem acesso académico"
          }
          className="lg:col-span-2"
        >
          {loading ? (
            <EmptyPanel message="A carregar…" />
          ) : !capabilities.students || studentsByClass.length === 0 ? (
            <EmptyPanel
              message={
                capabilities.students
                  ? "Ainda não há alunos por classe. Matricule estudantes ou atribua turmas."
                  : "O seu perfil não lê dados académicos."
              }
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={studentsByClass}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="classe" tickLine={false} axisLine={false} {...axis} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} {...axis} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="alunos" fill="var(--chart-1)" radius={[8, 8, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Distribuição por género">
          {!capabilities.students || totalStudents === 0 ? (
            <EmptyPanel message="Sem dados de género." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={genderSplit}
                    dataKey="value"
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={3}
                  >
                    {genderSplit.map((_, i) => (
                      <Cell key={i} fill={`var(--chart-${i + 1})`} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-2 text-sm">
                {genderSplit.map((g, i) => (
                  <li key={g.name} className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: `var(--chart-${i + 1})` }}
                    />
                    <span className="text-muted-foreground">{g.name}</span>
                    <span className="ml-auto font-semibold">
                      {g.value} ({Math.round((g.value / totalStudents) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Matrículas por mês" meta={`${enrollTotal} no período`}>
          {!capabilities.students ? (
            <EmptyPanel message="Sem acesso às matrículas." />
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={enrollmentsByMonth}>
                <defs>
                  <linearGradient id="enroll" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} {...axis} interval={1} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} {...axis} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="matriculas"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#enroll)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title={capabilities.finance ? "Recebido vs facturado" : "Taxa de presença"}
          meta={
            capabilities.finance
              ? `${finance?.invoice_count ?? 0} faturas`
              : attendanceAverage != null
                ? `Média: ${attendanceAverage}%`
                : "Sem dados"
          }
        >
          {capabilities.finance ? (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart
                data={financeMonthly.map((row) => ({
                  mes: row.month
                    ? new Date(`${row.month}T00:00:00`).toLocaleDateString("pt-PT", {
                        month: "short",
                        year: "2-digit",
                      })
                    : "—",
                  facturado: row.billed,
                  recebido: row.received,
                }))}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} {...axis} />
                <YAxis tickLine={false} axisLine={false} {...axis} />
                <Tooltip
                  formatter={(value: number) => kwanza(value)}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="facturado"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  fillOpacity={0.15}
                  fill="var(--chart-2)"
                />
                <Area
                  type="monotone"
                  dataKey="recebido"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fillOpacity={0.2}
                  fill="var(--chart-1)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : !capabilities.students ? (
            <EmptyPanel message="Sem indicadores disponíveis para o seu perfil." />
          ) : (
            <EmptyPanel
              message={
                attendanceAverage != null
                  ? `Presença média actual: ${attendanceAverage}%`
                  : "Ainda não há taxas de presença nos alunos."
              }
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

export function DashboardAgeChart({
  capabilities,
  ageDistribution,
}: {
  capabilities: { students: boolean };
  ageDistribution: Array<{ faixa: string; alunos: number }>;
}) {
  const ageTotal = ageDistribution.reduce((sum, item) => sum + item.alunos, 0);
  return (
    <ChartCard title="Distribuição por idade" meta={`${ageTotal} com idade registada`}>
      {!capabilities.students ? (
        <EmptyPanel message="Sem acesso académico." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ageDistribution}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="faixa" tickLine={false} axisLine={false} {...axis} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} {...axis} />
            <Bar dataKey="alunos" fill="var(--chart-5)" radius={[8, 8, 0, 0]} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function DashboardChartsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card h-[320px] animate-pulse bg-muted/40 lg:col-span-2" />
        <div className="surface-card h-[320px] animate-pulse bg-muted/40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card h-[300px] animate-pulse bg-muted/40" />
        <div className="surface-card h-[300px] animate-pulse bg-muted/40" />
      </div>
    </div>
  );
}
