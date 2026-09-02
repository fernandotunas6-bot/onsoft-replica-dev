import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, RefreshCw } from "lucide-react";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAccessCards, setAccessCardStatus } from "@/features/catracas/server";

const FILTER_DEFAULTS = { q: "", status: "all" };

export function AccessCardsPanel() {
  const queryClient = useQueryClient();
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "catracas-access-cards",
    FILTER_DEFAULTS,
  );

  const cardsQuery = useQuery({
    queryKey: ["access-cards", filters.status, filters.q],
    queryFn: () =>
      listAccessCards({
        data: {
          limit: 80,
          ...(filters.status !== "all"
            ? { status: filters.status as "active" | "suspended" | "lost" | "expired" }
            : {}),
          ...(filters.q.trim() ? { search: filters.q.trim() } : {}),
        },
      }),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { cardId: string; status: "active" | "suspended" | "lost" }) =>
      setAccessCardStatus({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-cards"] });
      toast.success("Estado do cartão actualizado.");
    },
    onError: (err) => {
      toast.error("Não foi possível actualizar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const cards = cardsQuery.data ?? [];

  return (
    <div className="surface-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h3 className="font-extrabold text-base flex items-center gap-2">
            <CreditCard className="size-5 text-primary" /> Cartões de Acesso
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lista escolar de cartões activos, suspensos ou perdidos.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["access-cards"] })}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className="size-3.5" /> Actualizar
        </Button>
      </div>

      <ListFilterBar
        fields={[
          {
            name: "q",
            type: "search",
            placeholder: "Nº cartão, barcode ou RFID…",
            "aria-label": "Pesquisar cartões",
          },
          {
            name: "status",
            type: "select",
            label: "Estado",
            options: [
              { value: "all", label: "Todos" },
              { value: "active", label: "Activos" },
              { value: "suspended", label: "Suspensos" },
              { value: "lost", label: "Perdidos" },
              { value: "expired", label: "Expirados" },
            ],
          },
        ]}
        values={filters}
        onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
        onReset={resetFilters}
        activeCount={activeCount}
      />

      {cardsQuery.isLoading ? (
        <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
          A carregar cartões…
        </div>
      ) : cards.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
          Nenhum cartão encontrado com estes filtros.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Pessoa</TableHead>
              <TableHead className="text-xs">Nº / Barcode</TableHead>
              <TableHead className="text-xs">RFID</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs text-right">Acções</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => (
              <TableRow key={card.id}>
                <TableCell className="text-xs font-semibold">{card.person_name}</TableCell>
                <TableCell className="text-xs font-mono">
                  {card.card_number}
                  <span className="block text-[10px] text-muted-foreground">{card.barcode}</span>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {card.rfid_tag || "—"}
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {card.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right space-x-1">
                  {card.status === "active" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({ cardId: card.id, status: "suspended" })
                        }
                      >
                        Suspender
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ cardId: card.id, status: "lost" })}
                      >
                        Perdido
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-[10px] font-bold"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ cardId: card.id, status: "active" })}
                    >
                      Reactivar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
