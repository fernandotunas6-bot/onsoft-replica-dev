import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { toastActionError } from "@/lib/action-error-toast";
import { cancelWaitlistEntry, listClassWaitlist, placeFromWaitlist } from "./waitlist";

/**
 * Lista de espera por turma (Administração e Secretaria). Mostra a fila de cada turma por
 * ordem de chegada; «Colocar» só fica disponível para quem está dentro das vagas livres.
 */
export function ClassWaitlistPanel() {
  const account = useCurrentAccount();
  const office = account.role === "Administrador" || account.role === "Secretaria";
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["enrollment", "waitlist"],
    queryFn: () => listClassWaitlist(),
    enabled: office,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["enrollment", "waitlist"] }),
      queryClient.invalidateQueries({ queryKey: ["pedagogical-workspace"] }),
    ]);
  const place = useMutation({
    mutationFn: (entryId: string) => placeFromWaitlist({ data: { entryId } }),
    onSuccess: async () => {
      toast.success("Aluno colocado na turma.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível colocar o aluno."),
  });
  const cancel = useMutation({
    mutationFn: (entryId: string) =>
      cancelWaitlistEntry({ data: { entryId, reason: "Retirado da lista pela secretaria." } }),
    onSuccess: async () => {
      toast.success("Retirado da lista de espera.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível retirar."),
  });

  if (!office || !query.data?.available || query.data.groups.length === 0) return null;

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ListOrdered className="size-4 text-muted-foreground" aria-hidden /> Lista de espera
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Alunos à espera de vaga em turmas cheias, por ordem de chegada. Quando sair alguém, coloque
        o primeiro da fila.
      </p>
      <div className="mt-3 space-y-4">
        {query.data.groups.map((group) => (
          <div key={group.classGroupId}>
            <p className="text-sm font-medium">
              Turma {group.name}{" "}
              <span className="text-xs text-muted-foreground">
                · {group.occupied}/{group.capacity} ·{" "}
                {group.freeSeats > 0 ? `${group.freeSeats} vaga(s)` : "cheia"}
              </span>
            </p>
            <ol className="mt-2 divide-y divide-border rounded-lg border">
              {group.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="mr-2 tabular-nums text-muted-foreground">
                      {entry.position}.º
                    </span>
                    {entry.name}
                    {entry.number ? (
                      <span className="text-xs text-muted-foreground"> · {entry.number}</span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · desde {entry.since.slice(0, 10)}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!entry.canPlace || place.isPending}
                      title={
                        entry.canPlace
                          ? "Colocar na turma"
                          : group.freeSeats === 0
                            ? "A turma está cheia"
                            : "Coloque primeiro quem chegou antes"
                      }
                      onClick={() => place.mutate(entry.id)}
                    >
                      Colocar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(entry.id)}
                    >
                      Retirar
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
