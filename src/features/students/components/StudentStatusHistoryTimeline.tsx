import { ArrowRight, Calendar, Clock, History, ShieldCheck, User } from "lucide-react";
import { StudentStatusBadge } from "./StudentStatusBadge";
import { cn } from "@/lib/utils";

export interface StatusHistoryEvent {
  id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by_name: string | null;
  created_at: string;
  event_type?: "status_change" | "candidacy" | "enrollment" | "transfer";
  details?: string | null;
}

export interface StudentStatusHistoryTimelineProps {
  events: StatusHistoryEvent[];
  isLoading?: boolean;
  className?: string;
}

export function StudentStatusHistoryTimeline({
  events,
  isLoading = false,
  className,
}: StudentStatusHistoryTimelineProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
        A carregar histórico de estados académicos…
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <History className="mx-auto size-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm font-medium text-foreground">
          Sem alterações de estado registadas
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Todas as movimentações de matrícula, transferências, anulações e actualizações de estado
          ficam automaticamente auditadas neste registo.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border",
        className,
      )}
    >
      {events.map((event, idx) => {
        const dateObj = new Date(event.created_at);
        const formattedDate = dateObj.toLocaleDateString("pt-AO", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const formattedTime = dateObj.toLocaleTimeString("pt-AO", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <div key={event.id || idx} className="relative group">
            {/* Ponto indicador da linha do tempo */}
            <span
              className="absolute -left-6 top-1.5 size-3 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20 group-hover:scale-125 transition-transform"
              aria-hidden="true"
            />

            <div className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-shadow hover:shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {event.previous_status ? (
                    <>
                      <StudentStatusBadge status={event.previous_status} size="sm" />
                      <ArrowRight className="size-3 text-muted-foreground" />
                    </>
                  ) : null}
                  <StudentStatusBadge status={event.new_status} size="sm" />
                  {event.details ? (
                    <span className="text-xs font-semibold text-foreground">· {event.details}</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                  <Calendar className="size-3" />
                  <span>{formattedDate}</span>
                  <span className="opacity-40">·</span>
                  <Clock className="size-3" />
                  <span>{formattedTime}</span>
                </div>
              </div>

              {event.reason ? (
                <div className="mt-2.5 rounded-lg bg-secondary/40 px-3 py-2 text-xs text-foreground">
                  <span className="font-semibold text-muted-foreground mr-1">Motivo:</span>
                  <span>{event.reason}</span>
                </div>
              ) : null}

              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <User className="size-3" />
                <span>Responsável: </span>
                <span className="font-medium text-foreground">
                  {event.changed_by_name || "Sistema Institucional"}
                </span>
                <ShieldCheck className="size-3 text-primary ml-1" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
