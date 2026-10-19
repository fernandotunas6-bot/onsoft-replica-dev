import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Switch } from "@/components/ui/switch";
import { getWebShowcase, updateWebShowcase } from "./web-showcase-server";

const QUERY_KEY = ["school", "web-showcase"] as const;

/**
 * «Mostrar a escola no site SIGA Plus»: desligado por defeito. Ligado, o site público
 * mostra o nome, o logótipo e a cidade da escola entre as escolas que usam o SIGA.
 */
export function WebShowcaseCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getWebShowcase(),
    enabled: canEdit,
  });
  const mutation = useMutation({
    mutationFn: (optedIn: boolean) => updateWebShowcase({ data: { optedIn } }),
    onSuccess: (choice) => {
      queryClient.setQueryData(QUERY_KEY, choice);
      toast.success(
        choice.optedIn
          ? "A escola passa a aparecer no site SIGA Plus."
          : "A escola deixa de aparecer no site SIGA Plus.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar a escolha."),
  });

  if (!canEdit) return null;
  const optedIn = query.data?.optedIn ?? false;

  return (
    <div className="space-y-3">
      <h5 className="text-xs font-bold text-muted-foreground">Site SIGA Plus</h5>
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
        <div className="space-y-1">
          <p id="web-showcase-label" className="text-sm font-medium">
            Mostrar a escola no site SIGA Plus
          </p>
          <p className="text-xs text-muted-foreground">
            Aparece em «Escolas que usam o SIGA Plus» com o nome, o logótipo e a cidade. Nenhum
            outro dado sai do SIGA. Pode desligar quando quiser.
          </p>
          {query.data?.hidden && optedIn ? (
            <p className="text-xs text-muted-foreground">
              A equipa SIGA Plus escondeu a escola do site por agora. Fale com o suporte.
            </p>
          ) : null}
        </div>
        <Switch
          checked={optedIn}
          onCheckedChange={(value) => mutation.mutate(value)}
          disabled={query.isLoading || mutation.isPending}
          aria-labelledby="web-showcase-label"
        />
      </div>
    </div>
  );
}
