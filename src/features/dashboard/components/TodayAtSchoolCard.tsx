import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Cake,
  CalendarDays,
  Clock3,
  DoorOpen,
  Receipt,
  UserCheck,
  Users,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { getSchoolTodayOps } from "@/features/dashboard/server";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { cn } from "@/lib/utils";

type TodayStat = {
  label: string;
  value: number | string;
  hint?: string;
  icon: typeof Clock3;
  href?: string;
  search?: Record<string, string>;
  tone?: "default" | "warning" | "success";
};

export function TodayAtSchoolCard() {
  const currentUser = useCurrentAccount();
  const todayQuery = useQuery({
    queryKey: ["dashboard", "today-ops"],
    queryFn: () => getSchoolTodayOps(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const ops = todayQuery.data;
  const loading = todayQuery.isLoading;
  const canPedagogica = canAccessPath("/pedagogica", currentUser.role);
  const canCalendario = canAccessPath("/calendario", currentUser.role);
  const canFaturas = canAccessPath("/faturas", currentUser.role);
  const canPessoas = canAccessPath("/pessoas", currentUser.role);
  const canTeacherQr = canAccessPath("/professor/presenca", currentUser.role);

  const stats: TodayStat[] = [
    {
      label: "Aulas agendadas",
      value: ops?.lessonsScheduled ?? "—",
      hint: ops ? `${ops.classesWithLessons} turma(s) · ${ops.roomsInUse} sala(s)` : undefined,
      icon: BookOpen,
      href: canPedagogica ? "/pedagogica" : undefined,
      search: { tab: "horarios" },
    },
    {
      label: "Professores escalados",
      value: ops?.teachersScheduled ?? "—",
      hint:
        ops && ops.teachersPendingCheckIn > 0
          ? `${ops.teachersPendingCheckIn} sem presença confirmada`
          : ops
            ? `${ops.teachersCheckedIn} com check-in`
            : undefined,
      icon: Users,
      tone: ops && ops.teachersPendingCheckIn > 0 ? "warning" : "default",
      href: canTeacherQr ? "/professor/presenca" : undefined,
    },
    {
      label: "A iniciar (30 min)",
      value: ops?.lessonsStartingSoon ?? "—",
      hint: "Próximas aulas pelo horário",
      icon: Clock3,
      tone: ops && ops.lessonsStartingSoon > 0 ? "success" : "default",
      href: canPedagogica ? "/pedagogica" : undefined,
      search: { tab: "chamada" },
    },
    {
      label: "Chamadas abertas",
      value: ops?.attendanceSessionsOpen ?? "—",
      hint: ops ? `${ops.attendanceSessionsDone} concluída(s)` : undefined,
      icon: UserCheck,
      href: canPedagogica ? "/pedagogica" : undefined,
      search: { tab: "chamada" },
    },
    {
      label: "Aniversários",
      value: ops?.birthdaysToday ?? "—",
      hint: "Alunos e colaboradores",
      icon: Cake,
      href: canPessoas ? "/pessoas" : undefined,
    },
    {
      label: "Salas em uso",
      value: ops?.roomsInUse ?? "—",
      hint: "Com aula no horário de hoje",
      icon: DoorOpen,
    },
  ];

  if (ops && ops.overdueInvoices > 0 && canFaturas) {
    stats.push({
      label: "Faturas em atraso",
      value: ops.overdueInvoices,
      hint: "Cobranças vencidas",
      icon: Receipt,
      tone: "warning",
      href: "/faturas",
    });
  }

  if (ops && ops.calendarItemsToday > 0 && canCalendario) {
    stats.push({
      label: "Períodos em curso",
      value: ops.calendarItemsToday,
      hint: "Calendário lectivo",
      icon: CalendarDays,
      href: "/calendario",
    });
  }

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconChip icon={CalendarDays} size="sm" label="Hoje na escola" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Hoje na escola</h2>
            <p className="truncate text-xs capitalize text-muted-foreground">
              {loading ? "A carregar o dia…" : (ops?.dateLabel ?? "—")}
            </p>
          </div>
        </div>
        {canCalendario ? (
          <Button asChild size="sm" variant="ghost" className="shrink-0 text-muted-foreground">
            <Link to="/calendario">Calendário</Link>
          </Button>
        ) : null}
      </div>

      <ul className="grid grid-cols-2 gap-px bg-border/60 xl:grid-cols-3">
        {stats.map((stat) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <stat.icon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{stat.label}</span>
              </span>
              <span
                className={cn(
                  "mt-2 block text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
                  loading && "animate-pulse text-muted-foreground",
                  stat.tone === "warning" && "text-warning",
                  stat.tone === "success" && "text-success",
                )}
              >
                {loading ? "…" : stat.value}
              </span>
              {stat.hint ? (
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {stat.hint}
                </span>
              ) : null}
            </>
          );

          return (
            <li key={stat.label} className="min-w-0 bg-card px-4 py-3.5 sm:px-5">
              {stat.href ? (
                <Link
                  to={stat.href as "/calendario"}
                  search={stat.search}
                  className="block -mx-1 rounded-lg px-1 transition-colors hover:bg-secondary/50"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
