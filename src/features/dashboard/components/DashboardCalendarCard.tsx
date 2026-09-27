import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { InlineLoading } from "@/components/ui/inline-loading";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { listCalendarEvents, type CalendarEventSummary } from "@/features/calendar/server";
import { todayInLuanda } from "@/features/calendar/dates";
import {
  buildUpcomingCalendarItems,
  upcomingItemHint,
  type UpcomingCalendarItem,
} from "@/features/calendar/upcoming";
import { cn } from "@/lib/utils";

export function DashboardCalendarCard({
  extraItems = [],
  title = "Calendário lectivo",
  limit = 6,
}: {
  /** Itens da turma (avaliações) juntos aos períodos da escola e feriados. */
  extraItems?: UpcomingCalendarItem[];
  title?: string;
  limit?: number;
} = {}) {
  const currentUser = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const today = todayInLuanda();
  const eventsQuery = useQuery({
    queryKey: ["calendar", "events", selectedYearId],
    queryFn: () =>
      listCalendarEvents({
        data: {
          limit: 50,
          academicYearId: selectedYearId ?? undefined,
          includePast: Boolean(selectedYearId),
        },
      }) as Promise<CalendarEventSummary[]>,
    retry: false,
  });
  const items = buildUpcomingCalendarItems(
    (eventsQuery.data ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      event_date: event.event_date,
      ends_on: event.ends_on,
    })),
    today,
    limit,
    extraItems,
  );
  const canOpen = canAccessPath("/calendario", currentUser.role);

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </h2>
        {canOpen ? (
          <Link to="/calendario" className="text-xs text-muted-foreground hover:text-foreground">
            Abrir
          </Link>
        ) : null}
      </div>
      {eventsQuery.isLoading ? (
        <div className="flex justify-center py-4">
          <InlineLoading label="A carregar calendário…" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Sem datas próximas neste ano lectivo.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const hint = upcomingItemHint(item, today);
            const highlighted = item.category === "assessment" || hint === "Em curso";
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    to="/calendario"
                    search={{ dia: item.event_date }}
                    className="block truncate text-sm hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {new Date(`${item.event_date}T00:00:00`).toLocaleDateString("pt-PT")}
                    {item.ends_on && item.ends_on !== item.event_date
                      ? ` → ${new Date(`${item.ends_on}T00:00:00`).toLocaleDateString("pt-PT")}`
                      : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    highlighted ? "bg-primary-soft text-primary-strong" : "text-muted-foreground",
                  )}
                >
                  {hint}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
