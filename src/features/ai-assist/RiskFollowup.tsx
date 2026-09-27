import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addRiskIntervention,
  listRiskCases,
  type RiskCase,
} from "@/features/ai-assist/risk-followup.functions";
import { cn } from "@/lib/utils";

export const riskCasesKey = ["risk", "cases"] as const;

const kinds = [
  "reunião encarregado",
  "tutoria",
  "aula de reforço",
  "acompanhamento psicológico",
  "nota",
] as const;

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Progress({ c }: { c: RiskCase }) {
  if (c.baseline_average == null || c.latest_average == null)
    return <span className="text-xs text-muted-foreground">Sem média</span>;
  const d = c.latest_average - c.baseline_average;
  const Icon = d > 0.05 ? ArrowUpRight : d < -0.05 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        d > 0.05 ? "text-primary" : d < -0.05 ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {c.baseline_average.toFixed(1)} → {c.latest_average.toFixed(1)}
    </span>
  );
}

function CaseCard({ c }: { c: RiskCase }) {
  const qc = useQueryClient();
  const add = useServerFn(addRiskIntervention);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof kinds)[number]>("tutoria");
  const [text, setText] = useState("");
  const [status, setStatus] = useState(c.status);
  const m = useMutation({
    mutationFn: () =>
      add({
        data: {
          caseId: c.id,
          kind,
          description: text,
          status: status as "aberto" | "em melhoria" | "resolvido",
        },
      }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: riskCasesKey });
    },
  });
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{c.student_name}</p>
          <p className="text-xs text-muted-foreground">
            {c.class_group_name ?? "Turma"} · risco {c.risk_level} · {c.status}
          </p>
        </div>
        <Progress c={c} />
      </div>
      <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => setOpen((v) => !v)}>
        {open ? "Esconder histórico" : `Histórico (${c.interventions.length})`}
      </Button>
      {open ? (
        <div className="mt-2 space-y-3">
          <ol className="space-y-2 border-l border-border pl-4 text-sm">
            {c.interventions.map((i) => (
              <li key={i.id}>
                <p className="text-xs text-muted-foreground">
                  {new Date(i.created_at).toLocaleDateString("pt-AO")} · {i.kind}
                  {i.average_snapshot != null ? ` · média ${i.average_snapshot.toFixed(1)}` : ""}
                </p>
                <p>{i.description}</p>
              </li>
            ))}
          </ol>
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Tipo de intervenção"
                className={selectClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof kinds)[number])}
              >
                {kinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <select
                aria-label="Estado"
                className={selectClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option>aberto</option>
                <option>em melhoria</option>
                <option>resolvido</option>
              </select>
            </div>
            <Textarea
              aria-label="Intervenção feita e resultado"
              rows={2}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="O que foi feito e o resultado…"
            />
            <div>
              <Button
                size="sm"
                disabled={text.trim().length < 3 || m.isPending}
                onClick={() => m.mutate()}
              >
                {m.isPending ? "A guardar…" : "Registar intervenção"}
              </Button>
              {m.error ? <p className="mt-1 text-xs text-destructive">{m.error.message}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RiskFollowup() {
  const list = useServerFn(listRiskCases);
  const q = useQuery({ queryKey: riskCasesKey, queryFn: () => list(), retry: false });
  const [filter, setFilter] = useState("activos");
  const cases = (q.data ?? []).filter((c) =>
    filter === "todos"
      ? true
      : filter === "resolvidos"
        ? c.status === "resolvido"
        : c.status !== "resolvido",
  );
  return (
    <Panel
      title="Acompanhamento"
      description="Alunos sinalizados, intervenções feitas e evolução da média desde a primeira análise."
      action={
        <select
          aria-label="Filtro"
          className={selectClass}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="activos">Em acompanhamento</option>
          <option value="resolvidos">Resolvidos</option>
          <option value="todos">Todos</option>
        </select>
      }
    >
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : cases.length === 0 ? (
        <EmptyState
          title="Sem alunos em acompanhamento"
          description="Analise uma turma: os alunos em risco ficam aqui para acompanhar."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cases.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </Panel>
  );
}
