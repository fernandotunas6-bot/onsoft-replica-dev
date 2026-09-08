import { useQuery } from "@tanstack/react-query";
import { Clock, Users, School, DoorOpen, AlertCircle, Sparkles } from "lucide-react";
import { getSchoolNowOverview } from "../advanced-academic-server";

export function SchoolNowWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["academic", "school-now-overview"],
    queryFn: () => getSchoolNowOverview(),
    refetchInterval: 30000, // actualiza a cada 30 segundos
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center p-4 rounded-xl border border-border/60 bg-muted/20 animate-pulse text-xs text-muted-foreground">
        A carregar estado da escola em tempo real…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card to-primary/5 p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-tight">Agora na Escola</h4>
            <p className="text-xs text-muted-foreground">Monitorização ao vivo das actividades académicas</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs font-mono font-medium text-foreground">
          <Clock className="size-3.5 text-primary" />
          {data.nowTime}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/50 bg-background/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Turmas em Aula</span>
            <School className="size-4 text-blue-500" />
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{data.classesActiveNow}</p>
        </div>

        <div className="rounded-xl border border-border/50 bg-background/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Professores em Aula</span>
            <Users className="size-4 text-purple-500" />
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{data.teachersActiveNow}</p>
        </div>

        <div className="rounded-xl border border-border/50 bg-background/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Salas Ocupadas</span>
            <DoorOpen className="size-4 text-amber-500" />
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{data.roomsOccupiedNow}</p>
        </div>

        <div className="rounded-xl border border-border/50 bg-background/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Salas Livres</span>
            <DoorOpen className="size-4 text-emerald-500" />
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {data.roomsFreeNow}{" "}
            <span className="text-xs font-normal text-muted-foreground">/ {data.totalRooms}</span>
          </p>
        </div>
      </div>

      {data.recommendations && data.recommendations.length > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <Sparkles className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Recomendação Pedagógica:</span>
            {data.recommendations.map((rec, i) => (
              <p key={i} className="text-muted-foreground dark:text-amber-300/80">
                {rec}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
