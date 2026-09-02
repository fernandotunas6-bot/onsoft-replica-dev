import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { listCalendarEvents, type CalendarEventSummary } from "@/features/calendar/server";
import { todayInLuanda } from "@/features/calendar/dates";
import { buildUpcomingCalendarItems, upcomingItemHint } from "@/features/calendar/upcoming";
import { cn } from "@/lib/utils";

export function DashboardCalendarCard() {
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
  );
  const canOpen = canAccessPath("/calendario", currentUser.role);

  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconChip icon={CalendarDays} size="sm" label="Calendário lectivo" />
          <h2 className="text-base font-semibold">Calendário lectivo</h2>
        </div>
        {canOpen ? (
          <Button asChild size="sm" variant="ghost">
            <Link to="/calendario">Abrir</Link>
          </Button>
        ) : null}
      </div>
      {eventsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar períodos…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem períodos próximos neste ano lectivo.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl bg-secondary p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">
                  <Link
                    to="/calendario"
                    search={{ dia: item.event_date }}
                    className="hover:underline"
                  >
                    {item.title}
                  </Link>
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    item.category === "holiday"
                      ? "bg-destructive/12 text-destructive"
                      : "bg-primary-soft text-primary-strong",
                  )}
                >
                  {upcomingItemHint(item, today)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(`${item.event_date}T00:00:00`).toLocaleDateString("pt-PT")}
                {item.ends_on && item.ends_on !== item.event_date
                  ? ` → ${new Date(`${item.ends_on}T00:00:00`).toLocaleDateString("pt-PT")}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
