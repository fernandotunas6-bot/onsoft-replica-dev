import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineLoading } from "@/components/ui/inline-loading";
import { toastActionError } from "@/lib/action-error-toast";
import {
  decideGradeChange,
  listGradeChangeRequests,
  type GradeChangeRequest,
} from "./grade-change-requests";
import { LOCKED_STATUS_LABEL } from "./grade-change-labels";

const KEY = ["academic", "grade-change-requests"];

/** Fila da coordenação: pedidos de alteração de nota, com aprovar/recusar. */
export function GradeChangeRequestsPanel() {
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => listGradeChangeRequests() as Promise<{ items: GradeChangeRequest[] }>,
  });
  const items = query.data?.items ?? [];
  if (query.isLoading) return <InlineLoading label="A carregar pedidos de alteração…" />;
  if (query.isError || items.length === 0) return null;
  return (
    <section className="surface-card w-full min-w-0 space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <History className="size-4 text-muted-foreground" aria-hidden />
        Pedidos de alteração de nota
        <span className="text-muted-foreground">· {items.length}</span>
      </h2>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <RequestRow key={item.gradeScoreId} item={item} />
        ))}
      </ul>
    </section>
  );
}

function RequestRow({ item }: { item: GradeChangeRequest }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      decideGradeChange({
        data: { gradeScoreId: item.gradeScoreId, approve, ...(note ? { note } : {}) },
      }),
    onSuccess: (_r, approve) => {
      toast.success(approve ? "Alteração aprovada e registada no histórico." : "Pedido recusado.");
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toastActionError(error, "Não foi possível decidir o pedido."),
  });
  const lockedLabel = item.sheetStatus ? LOCKED_STATUS_LABEL[item.sheetStatus] : undefined;
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          {item.studentName}
          <span className="text-muted-foreground">
            {" "}
            · {item.className} · {item.subjectName} · {item.component}
            {item.term ? ` · ${item.term}.º T` : ""}
          </span>
        </p>
        <p className="text-sm tabular-nums">
          {item.current ?? "—"} → <span className="font-medium">{item.requested}</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        “{item.reason}” — {item.requestedBy},{" "}
        {item.requestedAt ? new Date(item.requestedAt).toLocaleDateString("pt-PT") : ""}
      </p>
      {lockedLabel ? (
        <p className="text-xs text-warning-strong">
          A pauta do período está {lockedLabel}: reabra-a para rectificação antes de aprovar.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-xs text-xs"
          placeholder="Nota da coordenação (opcional)"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Nota da coordenação"
        />
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={decide.isPending || Boolean(lockedLabel)}
          onClick={() => decide.mutate(true)}
        >
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={decide.isPending}
          onClick={() => decide.mutate(false)}
        >
          Recusar
        </Button>
      </div>
    </li>
  );
}
