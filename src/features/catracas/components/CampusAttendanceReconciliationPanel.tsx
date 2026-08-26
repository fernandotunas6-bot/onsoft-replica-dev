import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Clock, ShieldAlert, Users, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCampusVsClassroomReconciliation } from "@/features/catracas/server";

export function CampusAttendanceReconciliationPanel() {
  const reconQuery = useQuery({
    queryKey: ["campus-classroom-reconciliation"],
    queryFn: () => getCampusVsClassroomReconciliation(),
  });

  const data = reconQuery.data;

  return (
    <div className="surface-card p-5 space-y-4 border-2 border-warning/30">
      <div className="flex flex-wrap items-center justify-between border-b border-border pb-3 gap-2">
        <div>
          <h3 className="font-extrabold text-base flex items-center gap-2">
            <ShieldAlert className="size-5 text-warning" /> Conciliação: Portaria vs. Sala de Aula
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cruzamento automático de entradas na catraca com a chamada feita pelos professores.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => reconQuery.refetch()}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className="size-3.5" /> Atualizar Análise
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
            <Users className="size-4 text-primary" /> Entradas no Recinto Hoje
          </span>
          <p className="text-2xl font-extrabold text-foreground">
            {data?.totalCampusEntriesToday ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground">Estudantes validados na portaria</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
            <AlertTriangle className="size-4 text-warning" /> Discrepâncias Detetadas
          </span>
          <p className="text-2xl font-extrabold text-warning-strong">{data?.anomaliesFound ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">
            Faltas no recinto ou entradas fora de hora
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1 sm:col-span-2 lg:col-span-1">
          <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
            <CheckCircle className="size-4 text-success" /> Índice de Integridade
          </span>
          <p className="text-2xl font-extrabold text-success-strong">
            {data?.totalCampusEntriesToday
              ? Math.round(
                  ((data.totalCampusEntriesToday - data.anomaliesFound) /
                    data.totalCampusEntriesToday) *
                    100,
                )
              : 100}
            %
          </p>
          <p className="text-[11px] text-muted-foreground">Concordância portaria / sala</p>
        </div>
      </div>

      {/* LISTA DE ALERTAS DE DISCREPÂNCIA / BALDOU-SE À AULA */}
      {reconQuery.isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
          A analisar dados de presenças da portaria e turmas...
        </div>
      ) : !data || data.anomalies.length === 0 ? (
        <div className="p-4 rounded-xl border border-success/30 bg-success/10 text-success-strong text-xs flex items-center gap-3">
          <CheckCircle className="size-5 shrink-0 text-success" />
          <div>
            <p className="font-bold">Nenhuma anomalia detetada hoje!</p>
            <p className="text-[11px] opacity-90">
              Todos os alunos que entraram no recinto estão presentes em sala de aula.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {data.anomalies.map((an, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`size-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                    an.severity === "high"
                      ? "bg-destructive/10 text-destructive border border-destructive/30"
                      : "bg-warning/10 text-warning-strong border border-warning/30"
                  }`}
                >
                  <AlertTriangle className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-foreground">{an.studentName}</h4>
                  <p className="text-[11px] text-muted-foreground">{an.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono gap-1">
                  <Clock className="size-3" /> Portaria: {an.gateEntryTime}
                </Badge>
                {an.severity === "high" ? (
                  <Badge variant="destructive" className="text-[10px] uppercase font-extrabold">
                    Alerta de Evasão
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-warning/10 text-warning-strong border-warning/30 text-[10px]"
                  >
                    Entrada Tardia
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
