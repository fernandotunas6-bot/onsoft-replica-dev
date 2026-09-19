import type { RelationMap } from "../types";
import type { DashboardOverviewSnapshot } from "./dashboard-suggestion-rules";

export function buildDashboardOverviewRelationMap(): RelationMap<DashboardOverviewSnapshot> {
  return [
    {
      key: "horarios",
      label: "Horários",
      module: "pedagogica",
      resolve: () => ({
        status: "ok",
        summary: "Horário semanal das turmas",
        route: "/pedagogica?tab=horarios",
      }),
    },
    {
      key: "calendario-escolar",
      label: "Calendário Escolar",
      module: "pedagogica",
      resolve: (snapshot) => ({
        status: snapshot.upcomingEvents === 0 ? "empty" : "ok",
        summary:
          snapshot.upcomingEvents === 0
            ? "Sem eventos próximos agendados"
            : `${snapshot.upcomingEvents} evento(s) próximo(s)`,
        route: "/calendario",
      }),
    },
  ];
}
