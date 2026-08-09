import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Receipt,
  RefreshCw,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
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
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  ageDistribution,
  attendanceRate,
  enrollmentStatus,
  enrollmentsByMonth,
  financeSummary,
  genderSplit,
  miniStats,
  recentActivity,
  schoolYear,
  stats,
  studentsByClass,
  studentsByCourse,
  topClasses,
  upcoming,
} from "@/lib/school-data";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · SIGA — Gestão Escolar" },
      {
        name: "description",
        content:
          "Painel de gestão escolar SIGA: estudantes, turmas, matrículas, presenças e situação financeira do ano lectivo.",
      },
      { property: "og:title", content: "Dashboard · SIGA — Gestão Escolar" },
      {
        property: "og:description",
        content: "Visão geral do ano lectivo: estudantes, turmas, matrículas e finanças.",
      },
    ],
  }),
  component: Dashboard,
});

const statIcons = { users: Users, userCheck: UserCheck, userRound: UserRound, receipt: Receipt };
const miniIcons = { graduation: GraduationCap, building: Building2, door: DoorOpen, activity: Activity };

const toneBg: Record<string, string> = {
  primary: "bg-primary-soft text-primary",
  info: "bg-info/10 text-info",
  pink: "bg-chart-2/10 text-chart-2",
  warning: "bg-warning/15 text-warning-foreground",
};

const dotTone: Record<string, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  primary: "bg-primary",
};

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
} as const;

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
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Dashboard() {

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Sábado, 8 de Agosto de 2026</p>
            <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">Boa noite, usuario teste</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Resumo do {schoolYear}
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <RefreshCw className="size-4" /> Actualizar
          </Button>
        </div>

        <section className="surface-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-primary" />
              Progresso do {schoolYear}
            </div>
            <span className="text-sm font-bold text-primary">100%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-full rounded-full bg-primary" />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>08/2024</span>
            <span>07/2025</span>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => {
            const Icon = statIcons[s.icon as keyof typeof statIcons];
            return (
              <div key={s.label} className="surface-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <span className={`flex size-10 items-center justify-center rounded-xl ${toneBg[s.tone]}`}>
                    <Icon className="size-5" />
                  </span>
                </div>
                <p className="mt-3 text-4xl font-extrabold tracking-tight">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {miniStats.map((s) => {
            const Icon = miniIcons[s.icon as keyof typeof miniIcons];
            return (
              <div key={s.label} className="surface-card flex items-center gap-4 p-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Estudantes por classe" meta="7 estudantes" className="lg:col-span-2">
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
          </ChartCard>

          <ChartCard title="Distribuição por género">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={genderSplit} dataKey="value" innerRadius={58} outerRadius={84} paddingAngle={3}>
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
                    {g.value} ({Math.round((g.value / 7) * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Matrículas por mês" meta="7 no total">
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
          </ChartCard>

          <ChartCard title="Taxa de presença mensal" meta="Média: 97%">
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={attendanceRate}>
                <defs>
                  <linearGradient id="att" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} {...axis} />
                <YAxis domain={[80, 100]} tickLine={false} axisLine={false} {...axis} unit="%" />
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
                  dataKey="taxa"
                  stroke="var(--chart-3)"
                  strokeWidth={2.5}
                  fill="url(#att)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Distribuição por idade" meta="7 com idade registada">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ageDistribution}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="faixa" tickLine={false} axisLine={false} {...axis} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} {...axis} />
                <Bar dataKey="alunos" fill="var(--chart-5)" radius={[8, 8, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <section className="surface-card p-5">
            <h2 className="mb-4 text-base font-semibold">Actividade recente</h2>
            <ul className="space-y-4">
              {recentActivity.map((a) => (
                <li key={a.title} className="flex gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone[a.tone]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{a.time}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface-card p-5">
            <h2 className="mb-4 text-base font-semibold">Próximos eventos</h2>
            <ul className="space-y-3">
              {upcoming.map((e) => (
                <li key={e.title} className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <CalendarDays className="size-4" />
                  </span>
                  <p className="text-sm font-medium">{e.title}</p>
                  <span className="ml-auto text-xs font-semibold text-muted-foreground">{e.date}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              Sem facturas registadas para este ano lectivo.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
